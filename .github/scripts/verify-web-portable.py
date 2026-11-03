"""Install a prebuilt package in isolation and verify its local Web entry without model calls."""
import http.cookiejar
from html.parser import HTMLParser
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request


class ScriptSources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'script' and attributes.get('src'):
            self.sources.append(attributes['src'])


def verify(archive):
    with tempfile.TemporaryDirectory(prefix='harness-web-smoke-', dir=os.environ.get('RUNNER_TEMP')) as directory:
        root = Path(directory)
        with tarfile.open(archive) as packed:
            packed.extractall(root, filter='data')
        bundles = [path for path in root.iterdir() if path.is_dir()]
        if len(bundles) != 1:
            raise RuntimeError('Expected one extracted Web package')
        bundle = bundles[0]
        env = {key: value for key, value in os.environ.items()
               if not (key.endswith('_API_KEY') or key.endswith('_TOKEN'))}
        env.update(DSH_HOME=str(root / 'user-data'), DSH_TELEMETRY_DISABLED='1')
        subprocess.run(['./install.sh'], cwd=bundle, env=env, check=True)
        log = root / 'startup-private.log'
        log.touch(mode=0o600)
        with log.open('w') as output:
            child = subprocess.Popen(['./start.sh', '--no-open', '--port', '0'], cwd=bundle, env=env,
                                     stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                deadline = time.monotonic() + 45
                url = None
                while time.monotonic() < deadline:
                    matches = re.findall(r'http://(?:127\.0\.0\.1|localhost):\d+[^\s\x1b]*',
                                         log.read_text(errors='replace'))
                    if matches:
                        url = matches[-1].rstrip(')')
                        break
                    if child.poll() is not None:
                        break
                    time.sleep(0.2)
                if not url:
                    raise RuntimeError('Web service did not announce its local URL; private startup log omitted')
                opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
                with opener.open(url, timeout=10) as response:
                    html = response.read().decode()
                    base = response.geturl()
                    print(f'Web page: HTTP {response.status}, {len(html)} bytes')
                parser = ScriptSources()
                parser.feed(html)
                if not parser.sources:
                    raise RuntimeError('No compiled frontend script found')
                for source in parser.sources:
                    address = urllib.parse.urljoin(base, source)
                    if urllib.parse.urlsplit(address).netloc != urllib.parse.urlsplit(base).netloc:
                        raise RuntimeError('Unexpected external frontend script')
                    with opener.open(address, timeout=10) as response:
                        if not response.read():
                            raise RuntimeError('Empty frontend script')
                print(f'Compiled frontend scripts: {len(parser.sources)} served successfully')
                print('Prebuilt Web package installed and started without a frontend/backend rebuild')
            finally:
                if child.poll() is None:
                    try:
                        os.killpg(child.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass  # The owned process exited between polling and signalling.
                    try:
                        child.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait(timeout=5)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 verify-web-portable.py <one-web-package.tar.gz>')
    verify(Path(sys.argv[1]).resolve())
