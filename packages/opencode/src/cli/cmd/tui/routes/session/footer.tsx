import { createMemo, createResource, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useDirectory } from "../../context/directory"
import { useConnected } from "../../component/dialog-model"
import { createStore } from "solid-js/store"
import { useRoute } from "../../context/route"
import { useSDK } from "../../context/sdk"

export function Footer() {
  const { theme } = useTheme()
  const sync = useSync()
  const route = useRoute()
  const sdk = useSDK()
  const mcp = createMemo(() => Object.values(sync.data.mcp).filter((x) => x.status === "connected").length)
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some((x) => x.status === "failed"))
  const lsp = createMemo(() => Object.keys(sync.data.lsp))
  const permissions = createMemo(() => {
    if (route.data.type !== "session") return []
    const session = sync.session.get(route.data.sessionID)
    return session?.permission ?? []
  })
  const directory = useDirectory()
  const connected = useConnected()

  // Fetch MCP tools to check which are disabled
  const [mcpTools] = createResource(
    () => (route.data.type === "session" && mcp() > 0 ? route.data.sessionID : null),
    async () => {
      const res = await sdk.client.mcp.tools()
      return res.data ?? {}
    },
  )

  // Check if any MCP has some (but not all) tools disabled
  const mcpPartiallyDisabled = createMemo(() => {
    const tools = mcpTools()
    if (!tools || route.data.type !== "session") return false

    const perms = permissions()
    const mcpServers = Object.entries(sync.data.mcp).filter(([_, s]) => s.status === "connected")

    for (const [serverName, serverTools] of Object.entries(tools)) {
      const toolKeys = serverTools.map((t) => t.key)
      const disabledCount = toolKeys.filter((key) => {
        const rule = [...perms].reverse().find((r) => r.permission === key || r.permission === "*")
        return rule && rule.action === "deny" && rule.pattern === "*"
      }).length

      // If some tools are disabled but not all, it's partially disabled
      if (disabledCount > 0 && disabledCount < toolKeys.length) {
        return true
      }
    }
    return false
  })

  const [store, setStore] = createStore({
    welcome: false,
  })

  onMount(() => {
    // Track all timeouts to ensure proper cleanup
    const timeouts: ReturnType<typeof setTimeout>[] = []

    function tick() {
      if (connected()) return
      if (!store.welcome) {
        setStore("welcome", true)
        timeouts.push(setTimeout(() => tick(), 5000))
        return
      }

      if (store.welcome) {
        setStore("welcome", false)
        timeouts.push(setTimeout(() => tick(), 10_000))
        return
      }
    }
    timeouts.push(setTimeout(() => tick(), 10_000))

    onCleanup(() => {
      timeouts.forEach(clearTimeout)
    })
  })

  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
      <text fg={theme.textMuted}>{directory()}</text>
      <box gap={2} flexDirection="row" flexShrink={0}>
        <Switch>
          <Match when={store.welcome}>
            <text fg={theme.text}>
              Get started <span style={{ fg: theme.textMuted }}>/connect</span>
            </text>
          </Match>
          <Match when={connected()}>
            <Show when={permissions().length > 0}>
              <text fg={theme.warning}>
                <span style={{ fg: theme.warning }}>△</span> {permissions().length} Permission
                {permissions().length > 1 ? "s" : ""}
              </text>
            </Show>
            <text fg={theme.text}>
              <span style={{ fg: lsp().length > 0 ? theme.success : theme.textMuted }}>•</span> {lsp().length} LSP
            </text>
            <Show when={mcp()}>
              <text fg={theme.text}>
                <Switch>
                  <Match when={mcpError()}>
                    <span style={{ fg: theme.error }}>⊙ </span>
                  </Match>
                  <Match when={mcpPartiallyDisabled()}>
                    <span style={{ fg: theme.warning }}>⊙ </span>
                  </Match>
                  <Match when={true}>
                    <span style={{ fg: theme.success }}>⊙ </span>
                  </Match>
                </Switch>
                {mcp()} MCP
              </text>
            </Show>
            <text fg={theme.textMuted}>/status</text>
          </Match>
        </Switch>
      </box>
    </box>
  )
}
