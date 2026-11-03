const START = '<!-- harness-generated:start -->'
const END = '<!-- harness-generated:end -->'

const changes = [
  ['101e11f8aa', '中转会话与请求传输', [
    '支持兼容中转的会话标识、分支隔离、稳定请求 ID 和请求用途区分。',
    '增加会话复用、确认点增量请求和大请求 gzip 压缩配置；这些能力需要中转端支持并启用对应选项。',
    '改进中转上下文超限错误识别，以及累计用量接口的上下文计量处理。',
  ]],
  ['9f73917ae5', '模型选择、会话控制与上下文处理', [
    '调整自定义模型推理等级配置和参数映射界面。',
    '增加仅当前会话生效的 Fast 控制和模型闪电标识，并贯通调用参数。',
    '增加供应商周额度的底栏显示及接口配置。',
    '改进上下文溢出后的压缩恢复与系统指令追加处理。',
    '修复 Linux VirtualBox 共享目录不支持硬链接时创建文件失败的问题；这项修复不改变 Windows、Mac 的文件权限。',
  ]],
  ['58079f7af3', '上下文溢出恢复', ['模型上下文溢出时，对部分历史执行压缩，降低恢复请求继续超限的风险。']],
  ['aad2ddf17d', '压缩请求大小控制', ['限制溢出恢复时提交给压缩模型的请求大小，避免恢复请求再次超过上限。']],
  ['30a28a99d3', 'Chat Completions 增量传输', [
    '接通 Chat Completions 的确认点增量请求，支持成功确认后的后缀发送及同一逻辑请求重试。',
    '断流或失败不推进确认点，保留工具调用历史，并覆盖 Fast 参数与 Responses 路径的兼容检查。',
  ]],
  ['c933b6acac', '周额度可见性', ['中转拒绝当前 Key 查询周额度时，隐藏底栏周额度显示；其他接口不可用状态仍按原逻辑处理。']],
  ['a44de55ee5', '测试与类型检查', ['修正中转测试的配置只读类型、助手消息来源类型和 fetch mock 参数类型。']],
  ['146734986c', '云端桌面打包', [
    '新增独立 GitHub 托管打包流程，支持 Mac ARM64、Mac Intel x64 和 Windows x64，保留原有本地及自有机器流程。',
    '新增显式 --local --unsigned 测试包模式，无需原项目更新服务配置；测试安装包不启用自动更新或强制更新。',
  ]],
  ['1d59f2c9e5', '从已有构建生成 Release 草稿', ['新增手动选择成功打包记录的流程，在 GitHub 内部转存安装包到 Release 草稿，无需重新编译或经本机下载上传。']],
]

/** Describe only changes present in the build's actual commit range. */
export function desktopReleaseNotes({ repository, sha, buildUrl, commits }) {
  const included = changes.filter(([prefix]) => commits.some(commit => commit.sha.startsWith(prefix)))
  const sections = included.map(([, title, items]) => `### ${title}\n\n${items.map(item => `- ${item}`).join('\n')}`)
  const list = commits.map(commit => {
    const subject = commit.commit.message.split('\n')[0].replace(/[<>]/g, '')
    return `- [${commit.sha.slice(0, 10)}](https://github.com/${repository}/commit/${commit.sha}) ${subject}`
  }).join('\n')
  return `${START}\n## 构建来源\n\n- [原始打包记录](${buildUrl})\n- 源码提交：\`${sha}\`\n- [相对上游基线的完整差异](https://github.com/${repository}/compare/22ddee3792...${sha})\n\n## 改动范围\n\n以下内容仅描述该安装包相对上游基线包含的 Harness 修改，不包含中转服务器自身的改动。\n\n${sections.join('\n\n')}\n\n## 所含提交\n\n${list || '与上游基线一致。'}\n\n## 安装与限制\n\n- 根据附件选择 Mac ARM64、Mac Intel x64 的 .dmg，或 Windows x64 的 .exe；Source code 压缩包不是安装包。\n- 这是未签名测试版本；Mac 未经 Apple 公证，Windows 未进行代码签名，系统可能提示安全确认。\n- 测试包不启用自动更新和强制更新，后续升级需要手动安装。\n- 会话复用、增量请求和周额度显示取决于供应商配置、协议支持及当前 Key 权限。\n- 构建成功不代表所有平台功能已完成实机验证，请在目标系统验证安装、启动及主要功能后发布。\n${END}`
}

/** Refresh generated notes while preserving text manually added outside the managed block. */
export function mergeDesktopReleaseNotes(previous, generated) {
  const start = previous.indexOf(START)
  const end = previous.indexOf(END)
  if (start !== -1 && end >= start) return previous.slice(0, start) + generated + previous.slice(end + END.length)
  if (previous.startsWith('Unsigned desktop test packages.')) return generated
  return previous.trim() ? `${previous.trim()}\n\n${generated}` : generated
}
