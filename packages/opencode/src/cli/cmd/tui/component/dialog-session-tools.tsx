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
    return Object.entries(toolMap()).flatMap(([server, list]) =>
      list.map((tool) => ({
        value: tool.key,
        title: tool.name,
        description: tool.description || undefined,
        category: server,
        categoryView: (
          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
            {server}
            <span style={{ fg: theme.textMuted }}>{" "}~{(serverTokens()[server] ?? 0).toLocaleString()}tk</span>
          </text>
        ) as any,
        footer: `~${tool.tokenEstimate}tk`,
        gutter: (
          <text fg={sel.has(tool.key) ? theme.success : theme.textMuted}>
            {sel.has(tool.key) ? "[✓]" : "[ ]"}
          </text>
        ) as any,
      })),
    )
  })

  function toggle(key: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
      onTrigger: (opt: DialogSelectOption<string>) => toggle(opt.value),
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
      onSelect={(opt) => {
        // Enter on an option = confirm the current selection
        confirm()
        dialog.clear()
      }}
    />
  )
}
