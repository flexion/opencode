import { createMemo, createSignal, onMount } from "solid-js"
import { useSDK } from "@tui/context/sdk"
import { useDialog } from "@tui/ui/dialog"
import { useTheme } from "@tui/context/theme"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { Keybind } from "@/util"
import { TextAttributes } from "@opentui/core"

type McpTool = { name: string; key: string; description: string; tokenEstimate: number }

interface Props {
  sessionID?: string
  onConfirm: (filter: string[] | "all") => void
  onDismiss: () => void
}

export function DialogSessionTools(props: Props) {
  const sdk = useSDK()
  const dialog = useDialog()
  const { theme } = useTheme()

  const [toolMap, setToolMap] = createSignal<Record<string, McpTool[]>>({})
  const [loading, setLoading] = createSignal(true)
  const [chosen, setChosen] = createSignal<Set<string>>(new Set())
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = createSignal("")

  onMount(async () => {
    dialog.setSize("large")

    const res = await sdk.client.mcp.tools()
    if (!res.data) {
      setLoading(false)
      return
    }
    setToolMap(res.data)

    const all = Object.values(res.data).flatMap((t) => t.map((x) => x.key))

    if (props.sessionID) {
      const sres = await sdk.client.session.get({ sessionID: props.sessionID })
      const permission = sres.data?.permission ?? []
      // A tool is disabled if its last matching rule is deny with pattern "*"
      const enabled = all.filter((key) => {
        const rule = [...permission].reverse().find((r) => r.permission === key || r.permission === "*")
        return !rule || rule.action !== "deny" || rule.pattern !== "*"
      })
      setChosen(new Set<string>(enabled))
    } else {
      setChosen(new Set<string>(all))
    }

    setLoading(false)
  })

  const allKeys = createMemo(() => Object.values(toolMap()).flatMap((t) => t.map((x) => x.key)))

  const totalTokens = createMemo(() =>
    Object.values(toolMap())
      .flat()
      .reduce((sum, t) => sum + (chosen().has(t.key) ? t.tokenEstimate : 0), 0),
  )

  const serverTokens = createMemo(() => {
    const result: Record<string, number> = {}
    for (const [server, list] of Object.entries(toolMap())) {
      result[server] = list.reduce((sum, t) => sum + (chosen().has(t.key) ? t.tokenEstimate : 0), 0)
    }
    return result
  })

  const options = createMemo((): DialogSelectOption<string>[] => {
    const sel = chosen()
    const collapsedSet = collapsed()
    const isSearching = searchQuery().trim().length > 0

    return Object.entries(toolMap()).flatMap(([server, list]) => {
      const isCollapsed = collapsedSet.has(server) && !isSearching
      const selectedCount = list.filter((t) => sel.has(t.key)).length
      const serverTk = serverTokens()[server] ?? 0

      // If collapsed, return only a summary row
      if (isCollapsed) {
        return [
          {
            value: `__server_header__${server}`,
            title: server,
            description: `${list.length} tools, ${selectedCount} selected, ~${serverTk.toLocaleString()}tk`,
            category: server,
            categoryView: (
              <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                <span style={{ fg: theme.textMuted }}>▶ </span>
                {server}
                <span style={{ fg: theme.textMuted }}>
                  {" "}
                  {list.length} tools, {selectedCount} selected, ~{serverTk.toLocaleString()}tk
                </span>
              </text>
            ) as any,
            gutter: (
              <text fg={theme.textMuted}>
                {" ".repeat(3)}
              </text>
            ) as any,
          },
        ]
      }

      // Expanded: show header + all tools
      return [
        // Server header (clickable to collapse)
        {
          value: `__server_header__${server}`,
          title: server,
          category: server,
          categoryView: (
            <text fg={theme.accent} attributes={TextAttributes.BOLD}>
              <span style={{ fg: theme.textMuted }}>▼ </span>
              {server}
              <span style={{ fg: theme.textMuted }}>{" "}~{serverTk.toLocaleString()}tk</span>
            </text>
          ) as any,
          gutter: (
            <text fg={theme.textMuted}>
              {" ".repeat(3)}
            </text>
          ) as any,
        },
        // All tools in this server
        ...list.map((tool) => ({
          value: tool.key,
          title: tool.name,
          description: tool.description || undefined,
          category: server,
          footer: `~${tool.tokenEstimate}tk`,
          gutter: (
            <text fg={sel.has(tool.key) ? theme.success : theme.textMuted}>
              {sel.has(tool.key) ? "[✓]" : "[ ]"}
            </text>
          ) as any,
        })),
      ]
    })
  })

  function toggle(key: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleServerCollapse(server: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(server)) next.delete(server)
      else next.add(server)
      return next
    })
  }

  function getServerFromKey(key: string): string | null {
    for (const [server, list] of Object.entries(toolMap())) {
      if (list.some((t) => t.key === key)) return server
      if (key === `__server_header__${server}`) return server
    }
    return null
  }

  function selectAll() {
    setChosen(new Set<string>(allKeys()))
  }

  function selectNone() {
    setChosen(new Set<string>())
  }

  function confirm() {
    const sel = chosen()
    const keys = allKeys()
    // If every tool is selected, treat as "all" so no deny rules are written
    const filter: string[] | "all" = sel.size === keys.length ? "all" : [...sel]
    props.onConfirm(filter)
  }

  const keybinds = createMemo(() => [
    {
      keybind: Keybind.parse("space")[0],
      title: "toggle",
      onTrigger: (opt: DialogSelectOption<string>) => {
        // If it's a server header, toggle collapse; otherwise toggle tool selection
        if (opt.value.startsWith("__server_header__")) {
          const server = opt.value.replace("__server_header__", "")
          toggleServerCollapse(server)
        } else {
          toggle(opt.value)
        }
      },
    },
    {
      keybind: Keybind.parse("c")[0],
      title: "collapse",
      onTrigger: (opt: DialogSelectOption<string>) => {
        const server = getServerFromKey(opt.value)
        if (server) toggleServerCollapse(server)
      },
    },
    {
      keybind: Keybind.parse("a")[0],
      title: "all",
      onTrigger: () => selectAll(),
    },
    {
      keybind: Keybind.parse("n")[0],
      title: "none",
      onTrigger: () => selectNone(),
    },
    {
      // Display-only hint; actual confirm fires via onSelect (Enter)
      keybind: Keybind.parse("return")[0],
      title: "confirm",
      side: "right" as const,
      onTrigger: () => {},
    },
  ])

  const title = createMemo(() => {
    if (loading()) return "Session Tools  Loading…"
    const tk = totalTokens().toLocaleString()
    const sel = chosen().size
    const total = allKeys().length
    return `Session Tools  ${sel}/${total} tools · ~${tk} tokens`
  })

  return (
    <DialogSelect
      title={title()}
      placeholder="Search tools"
      flat
      options={options()}
      keybind={keybinds()}
      onFilter={(query) => setSearchQuery(query)}
      onSelect={(opt) => {
        // If user pressed Enter on a server header, toggle collapse instead of confirming
        if (opt.value.startsWith("__server_header__")) {
          const server = opt.value.replace("__server_header__", "")
          toggleServerCollapse(server)
          return
        }
        // Enter on a tool = confirm the current selection
        confirm()
        dialog.clear()
      }}
    />
  )
}
