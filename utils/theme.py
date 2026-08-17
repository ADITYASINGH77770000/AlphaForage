"""
utils/theme.py
──────────────────────────────────────────────────────────────────────────────
AlphaForge Cognitive UI Engine
Neuroscience-driven design: attention magnetism, reward loops, flow state.
Call apply_quantedge_theme() at the top of every page.
"""

try:
  import streamlit as st
except Exception:
  class _ColumnStub:
    def metric(self, *args, **kwargs):
      return None

  class _NoStreamlit:
    def markdown(self, *args, **kwargs):
      return None

    def plotly_chart(self, *args, **kwargs):
      return None

    def download_button(self, *args, **kwargs):
      return None

    def set_page_config(self, *args, **kwargs):
      return None

    def columns(self, n=1):
      return [_ColumnStub() for _ in range(n)]

    def dataframe(self, *args, **kwargs):
      return None

    def warning(self, *args, **kwargs):
      return None

    def info(self, *args, **kwargs):
      return None

  st = _NoStreamlit()


# ── Plotly dark theme config shared across all pages ─────────────────────────
PLOTLY_TEMPLATE = "plotly_dark"

PLOTLY_LAYOUT = dict(
    template=PLOTLY_TEMPLATE,
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(8,10,18,0.6)",
    font=dict(family="Inter, JetBrains Mono, monospace", color="#c8d6e5"),
    title_font=dict(size=16, color="#e8f4fd"),
    margin=dict(l=40, r=20, t=50, b=40),
    xaxis=dict(
        gridcolor="rgba(100,120,160,0.15)",
        zerolinecolor="rgba(100,120,160,0.25)",
        tickfont=dict(size=11),
    ),
    yaxis=dict(
        gridcolor="rgba(100,120,160,0.15)",
        zerolinecolor="rgba(100,120,160,0.25)",
        tickfont=dict(size=11),
    ),
)

# ── Colour palette ─────────────────────────────────────────────────────────
COLORS = {
    "signal_buy":    "#00f5a0",
    "signal_sell":   "#ff4757",
    "neutral":       "#ffd32a",
    "accent_blue":   "#0be0ff",
    "accent_purple": "#a55efd",
    "accent_gold":   "#ffd700",
    "dim":           "#546e8a",
    "glow_green":    "rgba(0,245,160,0.7)",
    "glow_red":      "rgba(255,71,87,0.7)",
    "glow_blue":     "rgba(11,224,255,0.7)",
}


# ── Master CSS ────────────────────────────────────────────────────────────────
_CSS = """
<style>
/* ── Google Fonts ── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Root variables ── */
:root {
  --bg-void:      #03050d;
  --bg-deep:      #070b16;

  --bg-panel:     rgba(10,16,30,0.85);
  --bg-glass:     rgba(14,22,42,0.72);
  --border-glow:  rgba(11,224,255,0.18);
  --border-dim:   rgba(80,110,160,0.22);
  --text-primary: #e8f4fd;
  --text-dim:     #7a9abb;
  --text-accent:  #0be0ff;
  --accent-buy:   #00f5a0;
  --accent-sell:  #ff4757;
  --accent-gold:  #ffd700;
  --accent-purp:  #a55efd;
  --glow-buy:     rgba(0,245,160,0.35);
  --glow-sell:    rgba(255,71,87,0.35);
  --glow-blue:    rgba(11,224,255,0.3);
  --glow-gold:    rgba(255,215,0,0.3);
  --font-main:    'Inter', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
  --radius:       12px;
  --radius-sm:    8px;
  --transition:   all 0.35s cubic-bezier(0.25,0.46,0.45,0.94);
}

/* ── Global reset ── */
*, *::before, *::after { box-sizing: border-box; }

html, body, [data-testid="stAppViewContainer"] {
  /* config.toml now matches --bg-void exactly — no flash between the two */
  background: var(--bg-void) !important;
  color: var(--text-primary) !important;
  font-family: var(--font-main);
  /* Smooth any residual color transition instead of opacity jump */
  transition: background-color 0.15s ease, color 0.15s ease;
}


/* ── Main content above bg ── */
[data-testid="stMain"], section.main, .block-container {
  position: relative;
  z-index: 1;
}

/* ── Hide native nav border to prevent double lines ── */
[data-testid="stSidebarNavSeparator"] { display: none !important; }

/* ── Prevent global typography from breaking Streamlit material icons ── */
.stIcon, span.material-symbols-rounded {
    font-family: 'Material Symbols Rounded' !important;
}

.block-container {
  padding-top: 2rem !important;
  max-width: 1400px !important;
}

/* ── Sidebar ── */
[data-testid="stSidebar"] {
  background: linear-gradient(180deg, rgba(7,11,22,0.98) 0%, rgba(10,16,32,0.98) 100%) !important;
  border-right: 1px solid var(--border-glow) !important;
  backdrop-filter: blur(20px);
}

[data-testid="stSidebar"]::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent-buy), var(--text-accent), var(--accent-purp));
  animation: topBarFlow 4s linear infinite;
  background-size: 200% 100%;
}

@keyframes topBarFlow {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

[data-testid="stSidebar"] * { font-family: var(--font-main) !important; }

[data-testid="stSidebarNav"] a {
  border-radius: var(--radius-sm) !important;
  transition: var(--transition) !important;
  margin: 2px 0 !important;
}
[data-testid="stSidebarNav"] a:hover {
  background: var(--bg-glass) !important;
  box-shadow: 0 0 12px var(--glow-blue) !important;
  transform: translateX(4px) !important;
}

/* ── Page headings ── */
h1 {
  font-size: 2rem !important;
  font-weight: 700 !important;
  background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-accent) 60%, var(--accent-purp) 100%);
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  background-clip: text !important;
  letter-spacing: -0.5px !important;
  margin-bottom: 0.2rem !important;
  animation: titleGlow 3s ease-in-out infinite alternate;
}

@keyframes titleGlow {
  0%   { filter: drop-shadow(0 0 8px rgba(11,224,255,0.3)); }
  100% { filter: drop-shadow(0 0 18px rgba(11,224,255,0.6)); }
}

h2 {
  font-size: 1.3rem !important;
  font-weight: 600 !important;
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-glow);
  padding-bottom: 6px;
}

h3 {
  font-size: 1.05rem !important;
  color: var(--text-dim) !important;
  font-weight: 500 !important;
}

[data-testid="stCaption"], .stCaption {
  color: var(--text-dim) !important;
  font-family: var(--font-mono) !important;
  font-size: 0.8rem !important;
  letter-spacing: 0.5px;
}

[data-testid="stMetric"] {
  background: var(--bg-glass) !important;
  border: 1px solid var(--border-dim) !important;
  border-radius: var(--radius) !important;
  padding: 18px 20px !important;
  transition: var(--transition) !important;
  backdrop-filter: blur(16px) !important;
}
[data-testid="stMetric"]:hover {
  border-color: var(--border-glow) !important;
  box-shadow: 0 0 20px var(--glow-blue), 0 4px 20px rgba(0,0,0,0.4) !important;
  transform: translateY(-2px) !important;
}
[data-testid="stMetricLabel"] {
  color: var(--text-dim) !important;
  font-size: 0.78rem !important;
  text-transform: uppercase !important;
  letter-spacing: 1px !important;
  font-family: var(--font-mono) !important;
}
[data-testid="stMetricValue"] {
  color: var(--text-accent) !important;
  font-size: 1.7rem !important;
  font-weight: 700 !important;
  font-family: var(--font-mono) !important;
}
[data-testid="stMetricDelta"] { font-size: 0.82rem !important; }

[data-testid="stButton"] > button,
button[kind="primary"],
.stButton button {
  background: linear-gradient(135deg, rgba(11,224,255,0.15), rgba(165,94,253,0.15)) !important;
  border: 1px solid var(--border-glow) !important;
  color: var(--text-accent) !important;
  font-family: var(--font-main) !important;
  font-weight: 600 !important;
  font-size: 0.88rem !important;
  letter-spacing: 0.5px !important;
  border-radius: var(--radius) !important;
  padding: 10px 28px !important;
  transition: var(--transition) !important;
  position: relative !important;
  overflow: hidden !important;
  text-transform: uppercase !important;
}
[data-testid="stButton"] > button:hover {
  background: linear-gradient(135deg, rgba(11,224,255,0.25), rgba(165,94,253,0.25)) !important;
  border-color: var(--text-accent) !important;
  box-shadow: 0 0 24px var(--glow-blue), 0 0 48px rgba(11,224,255,0.15) !important;
  transform: translateY(-2px) scale(1.02) !important;
  color: #fff !important;
}
[data-testid="stButton"] > button:active {
  transform: translateY(0) scale(0.98) !important;
}

button[kind="primary"] {
  background: linear-gradient(135deg, rgba(0,245,160,0.2), rgba(11,224,255,0.2)) !important;
  border-color: var(--accent-buy) !important;
  color: var(--accent-buy) !important;
}
button[kind="primary"]:hover {
  box-shadow: 0 0 28px var(--glow-buy), 0 0 56px rgba(0,245,160,0.1) !important;
  color: #fff !important;
}

[data-testid="stSelectbox"] > div,
[data-testid="stMultiSelect"] > div {
  background: var(--bg-glass) !important;
  border: 1px solid var(--border-dim) !important;
  border-radius: var(--radius-sm) !important;
  color: var(--text-primary) !important;
  transition: var(--transition) !important;
}
[data-testid="stSelectbox"]:hover > div,
[data-testid="stMultiSelect"]:hover > div {
  border-color: var(--border-glow) !important;
  box-shadow: 0 0 12px var(--glow-blue) !important;
}

[data-testid="stSlider"] [role="slider"] {
  background: var(--text-accent) !important;
  box-shadow: 0 0 12px var(--glow-blue) !important;
}

[data-testid="stNumberInput"] input,
[data-testid="stDateInput"] input,
.stTextInput input {
  background: var(--bg-glass) !important;
  border: 1px solid var(--border-dim) !important;
  border-radius: var(--radius-sm) !important;
  color: var(--text-primary) !important;
  font-family: var(--font-mono) !important;
  transition: var(--transition) !important;
}
[data-testid="stNumberInput"] input:focus,
[data-testid="stDateInput"] input:focus {
  border-color: var(--text-accent) !important;
  box-shadow: 0 0 12px var(--glow-blue) !important;
  outline: none !important;
}

[data-testid="stAlert"], .stAlert {
  border-radius: var(--radius) !important;
  backdrop-filter: blur(12px) !important;
  border-left-width: 3px !important;
  font-size: 0.88rem !important;
}
div[data-testid="stInfo"]    { background: rgba(11,224,255,0.06) !important; border-color: var(--text-accent) !important; }
div[data-testid="stWarning"] { background: rgba(255,215,0,0.06)  !important; border-color: var(--accent-gold)  !important; }
div[data-testid="stSuccess"] { background: rgba(0,245,160,0.06)  !important; border-color: var(--accent-buy)   !important; }
div[data-testid="stError"]   { background: rgba(255,71,87,0.08)  !important; border-color: var(--accent-sell)  !important; }

[data-testid="stTabs"] button[role="tab"] {
  background: transparent !important;
  border: none !important;
  color: var(--text-dim) !important;
  font-family: var(--font-mono) !important;
  font-size: 0.85rem !important;
  font-weight: 500 !important;
  letter-spacing: 0.5px !important;
  padding: 10px 20px !important;
  text-transform: uppercase !important;
  transition: var(--transition) !important;
  border-bottom: 2px solid transparent !important;
}
[data-testid="stTabs"] button[role="tab"]:hover {
  color: var(--text-primary) !important;
  border-bottom-color: rgba(11,224,255,0.4) !important;
}
[data-testid="stTabs"] button[role="tab"][aria-selected="true"] {
  color: var(--text-accent) !important;
  border-bottom: 2px solid var(--text-accent) !important;
  background: rgba(11,224,255,0.05) !important;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0 !important;
}

[data-testid="stExpander"] {
  background: var(--bg-glass) !important;
  border: 1px solid var(--border-dim) !important;
  border-radius: var(--radius) !important;
  backdrop-filter: blur(12px) !important;
  transition: var(--transition) !important;
}
[data-testid="stExpander"]:hover { border-color: var(--border-glow) !important; }
[data-testid="stExpanderToggleIcon"] { color: var(--text-accent) !important; }
[data-testid="stExpander"] summary {
  color: var(--text-dim) !important;
  font-size: 0.88rem !important;
  font-family: var(--font-mono) !important;
  padding: 12px 16px !important;
}

[data-testid="stDataFrame"] {
  border-radius: var(--radius) !important;
  overflow: hidden !important;
  border: 1px solid var(--border-dim) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
}

[data-testid="stPlotlyChart"] {
  border-radius: var(--radius) !important;
  border: 1px solid var(--border-dim) !important;
  overflow: hidden !important;
  transition: var(--transition) !important;
  box-shadow: 0 4px 30px rgba(0,0,0,0.4) !important;
}
[data-testid="stPlotlyChart"]:hover {
  border-color: var(--border-glow) !important;
  box-shadow: 0 0 30px var(--glow-blue), 0 4px 40px rgba(0,0,0,0.5) !important;
}

hr {
  border: none !important;
  height: 1px !important;
  background: linear-gradient(90deg, transparent, var(--border-glow), transparent) !important;
  margin: 1.5rem 0 !important;
}

[data-testid="stDownloadButton"] button {
  background: rgba(165,94,253,0.1) !important;
  border: 1px solid rgba(165,94,253,0.35) !important;
  color: var(--accent-purp) !important;
  font-family: var(--font-mono) !important;
  font-size: 0.82rem !important;
  border-radius: var(--radius-sm) !important;
  padding: 8px 20px !important;
  transition: var(--transition) !important;
}
[data-testid="stDownloadButton"] button:hover {
  background: rgba(165,94,253,0.2) !important;
  box-shadow: 0 0 16px rgba(165,94,253,0.4) !important;
}

::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--bg-deep); }
::-webkit-scrollbar-thumb { background: var(--border-glow); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-accent); }

label, .stSelectbox label, .stSlider label,
.stNumberInput label, .stDateInput label,
.stMultiSelect label, .stCheckbox label {
  color: var(--text-dim) !important;
  font-size: 0.8rem !important;
  font-family: var(--font-mono) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.8px !important;
  font-weight: 500 !important;
}

span[data-baseweb="tag"] {
  background: rgba(11,224,255,0.12) !important;
  border: 1px solid var(--border-glow) !important;
  border-radius: 20px !important;
  color: var(--text-accent) !important;
  font-size: 0.78rem !important;
  font-family: var(--font-mono) !important;
}

code, pre {
  background: rgba(10,16,30,0.8) !important;
  border: 1px solid var(--border-dim) !important;
  border-radius: var(--radius-sm) !important;
  font-family: var(--font-mono) !important;
  color: var(--accent-buy) !important;
}

[data-testid="column"] { padding: 0 6px !important; }

/* ── Sidebar nav tooltip / keyboard popup suppression ── */
/* Hide the floating tooltip label that appears when touching nav icons */
[data-testid="stSidebarNav"] a span[data-testid="stTooltipHoverTarget"],
[data-testid="stSidebarNav"] a [class*="tooltip"],
[data-testid="stSidebarNav"] [data-testid="tooltipContent"],
[data-testid="stSidebarNav"] [data-testid="stTooltipContent"] { display: none !important; }

/* Hide Streamlit’s keyboard shortcuts modal button (⌨ / ? button) */
button[data-testid="keyboardShortcutButton"],
[data-testid="keyboardShortcutModal"],
[data-testid="keyboardShortcuts"],
[aria-label="Keyboard shortcuts"] { display: none !important; }

/* Prevent sidebar nav <a> from showing native browser title-tooltip */
[data-testid="stSidebarNav"] a { title: none; }

/* Suppress any ::after tooltip injected by Streamlit on nav items */
[data-testid="stSidebarNav"] li::after,
[data-testid="stSidebarNav"] a::after { display: none !important; content: none !important; }

@keyframes alertPulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--glow-sell); }
  50%       { box-shadow: 0 0 24px 4px var(--glow-sell); }
}
.qe-alert-pulse { animation: alertPulse 2s ease-in-out infinite; }

.qe-page-header {
  padding: 0 0 20px 0;
  border-bottom: 1px solid var(--border-glow);
  margin-bottom: 24px;
  position: relative;
}
.qe-page-header::after {
  content: '';
  position: absolute;
  bottom: -1px; left: 0;
  width: 80px; height: 2px;
  background: linear-gradient(90deg, var(--accent-buy), var(--text-accent));
  border-radius: 2px;
}

.qe-metric-card {
  background: var(--bg-glass);
  border: 1px solid var(--border-dim);
  border-radius: var(--radius);
  padding: 18px 20px;
  text-align: center;
  transition: var(--transition);
  backdrop-filter: blur(16px);
  position: relative;
  overflow: hidden;
}
.qe-metric-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent-buy), var(--text-accent), var(--accent-purp));
  opacity: 0;
  transition: opacity 0.3s;
}
.qe-metric-card:hover {
  border-color: var(--border-glow);
  box-shadow: 0 0 24px var(--glow-blue), 0 8px 30px rgba(0,0,0,0.4);
  transform: translateY(-3px);
}
.qe-metric-card:hover::before { opacity: 1; }
.qe-metric-label {
  color: var(--text-dim);
  font-size: 0.72rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin-bottom: 8px;
}
.qe-metric-value {
  color: var(--text-accent);
  font-size: 1.6rem;
  font-weight: 700;
  font-family: var(--font-mono);
  line-height: 1;
}
.qe-metric-value.positive { color: var(--accent-buy) !important; }
.qe-metric-value.negative { color: var(--accent-sell) !important; }

.qe-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.qe-badge-buy  { background: rgba(0,245,160,0.12); border: 1px solid var(--accent-buy);  color: var(--accent-buy); }
.qe-badge-sell { background: rgba(255,71,87,0.12);  border: 1px solid var(--accent-sell); color: var(--accent-sell); }
.qe-badge-hold { background: rgba(255,215,0,0.1);   border: 1px solid var(--accent-gold); color: var(--accent-gold); }

.qe-regime-bull {
  background: radial-gradient(circle at 50% 50%, rgba(0,245,160,0.08), transparent 70%);
  border: 1px solid rgba(0,245,160,0.2);
  border-radius: var(--radius);
  padding: 16px 20px;
  animation: regimePulse 4s ease-in-out infinite;
}
.qe-regime-bear {
  background: radial-gradient(circle at 50% 50%, rgba(255,71,87,0.08), transparent 70%);
  border: 1px solid rgba(255,71,87,0.2);
  border-radius: var(--radius);
  padding: 16px 20px;
  animation: regimePulseRed 4s ease-in-out infinite;
}
.qe-regime-sideways {
  background: radial-gradient(circle at 50% 50%, rgba(255,215,0,0.05), transparent 70%);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: var(--radius);
  padding: 16px 20px;
}
@keyframes regimePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0,245,160,0.15); }
  50%       { box-shadow: 0 0 30px 4px rgba(0,245,160,0.15); }
}
@keyframes regimePulseRed {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,71,87,0.15); }
  50%       { box-shadow: 0 0 30px 4px rgba(255,71,87,0.15); }
}

.qe-agent-card {
  background: var(--bg-glass);
  border: 1px solid rgba(165,94,253,0.25);
  border-radius: var(--radius);
  padding: 18px;
  position: relative;
  overflow: hidden;
}
.qe-agent-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--accent-purp), var(--text-accent));
  animation: agentBeam 2s linear infinite;
  background-size: 200% 100%;
}
@keyframes agentBeam {
  0%   { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}

.qe-confidence-cloud {
  background: rgba(11,224,255,0.04);
  border: 1px dashed rgba(11,224,255,0.2);
  border-radius: var(--radius);
  padding: 14px;
  font-size: 0.82rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.qe-risk-high {
  background: radial-gradient(ellipse at center, rgba(255,71,87,0.12) 0%, transparent 70%);
  border: 1px solid rgba(255,71,87,0.3);
  border-radius: var(--radius);
  padding: 14px;
}

.qe-toast {
  position: fixed;
  bottom: 24px; right: 24px;
  background: var(--bg-glass);
  border: 1px solid var(--border-glow);
  border-radius: var(--radius);
  padding: 14px 20px;
  backdrop-filter: blur(20px);
  z-index: 9999;
  animation: toastSlideIn 0.4s cubic-bezier(0.25,0.46,0.45,0.94);
  min-width: 260px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px var(--glow-blue);
}
@keyframes toastSlideIn {
  from { transform: translateX(120%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
</style>
"""

_JS = """
<script>
(function() {
  function initHoverFocus() {
    const charts = document.querySelectorAll('[data-testid="stPlotlyChart"]');
    charts.forEach(chart => {
      chart.addEventListener('mouseenter', () => {
        charts.forEach(c => { if (c !== chart) c.style.opacity = '0.55'; });
      });
      chart.addEventListener('mouseleave', () => {
        charts.forEach(c => { c.style.opacity = '1'; });
      });
    });
  }

  function initRipple() {
    document.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = btn.getBoundingClientRect();
        ripple.style.cssText = `
          position:absolute;left:${e.clientX-rect.left}px;top:${e.clientY-rect.top}px;
          width:0;height:0;border-radius:50%;
          background:rgba(11,224,255,0.35);
          transform:translate(-50%,-50%);
          animation:rippleAnim 0.6s ease-out forwards;
          pointer-events:none;
        `;
        if (!document.getElementById('qe-ripple-style')) {
          const s = document.createElement('style');
          s.id = 'qe-ripple-style';
          s.textContent = '@keyframes rippleAnim{to{width:200px;height:200px;opacity:0;}}';
          document.head.appendChild(s);
        }
        btn.style.position = 'relative';
        btn.style.overflow = 'hidden';
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
      });
    });
  }

  function initMetricBurst() {
    document.querySelectorAll('[data-testid="stMetric"]').forEach(el => {
      el.addEventListener('mouseenter', function() {
        for (let i = 0; i < 5; i++) {
          const p = document.createElement('div');
          p.style.cssText = `
            position:absolute;width:4px;height:4px;border-radius:50%;
            background:rgba(11,224,255,${0.4+Math.random()*0.6});
            left:${40+Math.random()*20}%;top:${40+Math.random()*20}%;
            animation:particleBurst${i} 0.8s ease-out forwards;
            pointer-events:none;z-index:999;
          `;
          if (!document.getElementById('qe-particle-style')) {
            const s = document.createElement('style');
            s.id = 'qe-particle-style';
            s.textContent =
              [0,1,2,3,4].map(n =>
                `@keyframes particleBurst${n}{to{transform:translate(${(Math.random()-0.5)*60}px,${-40-Math.random()*40}px);opacity:0;}}`
              ).join('');
            document.head.appendChild(s);
          }
          el.style.position = 'relative';
          el.appendChild(p);
          setTimeout(() => p.remove(), 900);
        }
      });
    });
  }

  function init() {
    initHoverFocus();
    initRipple();
    initMetricBurst();
  }

  let attempts = 0;
  const interval = setInterval(() => {
    if (document.querySelector('[data-testid="stMain"]') || ++attempts > 20) {
      clearInterval(interval);
      init();
      // Re-init only for new elements added to stMain (not the whole body),
      // with a longer debounce to avoid visual instability on page nav.
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(init, 600);
      });
      const mainEl = document.querySelector('[data-testid="stMain"]');
      if (mainEl) observer.observe(mainEl, { childList: true, subtree: false });
    }
  }, 300);
})();
</script>
"""


# ── Animated brand splash ────────────────────────────────────────────────────
# Plays once per browser tab, on the app's entry page only.
#
# It is injected into the TOP document by a tiny one-shot component script —
# deliberately NOT via st.markdown. Streamlit re-mounts markdown elements on
# every rerun, which restarts CSS animations; that made the overlay linger on
# top of slow pages and cover their charts. Living outside Streamlit's managed
# DOM, the overlay plays once, then deletes itself, and a sessionStorage flag
# stops it coming back. Being fixed to the real viewport it also covers the
# header and sidebar, so only the logo shows while it plays — no CSS that
# touches the rest of the app.

_SPLASH_MS = 4200

_SPLASH_CSS = """
@keyframes afSplashOut { 0%,82% { opacity:1; } 100% { opacity:0; } }
@keyframes afBgShift  { 0%,100% { background-position:0% 50%, 100% 50%, 0 0; }
                        50% { background-position:100% 50%, 0% 50%, 0 0; } }
@keyframes afSpin     { to { transform:rotate(360deg); } }
@keyframes afSpinRev  { to { transform:rotate(-360deg); } }
@keyframes afPulse    { 0% { transform:scale(.45); opacity:.65; }
                        100% { transform:scale(1.9); opacity:0; } }
@keyframes afPop      { 0% { transform:scale(.5); opacity:0; }
                        65% { opacity:1; } 100% { transform:scale(1); opacity:1; } }
@keyframes afDraw     { from { stroke-dashoffset:340; } to { stroke-dashoffset:0; } }
@keyframes afGlow     { 0%,100% { filter:drop-shadow(0 0 6px rgba(11,224,255,.5)); }
                        50% { filter:drop-shadow(0 0 22px rgba(11,224,255,.95)); } }
@keyframes afRise     { 0% { opacity:0; transform:translateY(16px); }
                        100% { opacity:1; transform:translateY(0); } }
@keyframes afFlow     { to { background-position:220% center; } }
@keyframes afSpark    { 0%,100% { r:3.2; opacity:.7; } 50% { r:5.2; opacity:1; } }
@keyframes afFloat    { 0% { transform:translateY(20px) scale(.6); opacity:0; }
                        20% { opacity:.9; } 100% { transform:translateY(-120px) scale(1); opacity:0; } }
@keyframes afBar      { from { width:0; } to { width:100%; } }
#af-splash {
  position:fixed; inset:0; z-index:2147483000; pointer-events:none;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:26px; overflow:hidden; background:#05070f;
  animation: afSplashOut 4.2s ease-in forwards;
}
#af-splash .af-bg {
  position:absolute; inset:-20%;
  background:
    radial-gradient(circle at 30% 32%, rgba(0,245,160,.14), transparent 42%),
    radial-gradient(circle at 70% 68%, rgba(165,94,253,.16), transparent 46%),
    #05070f;
  background-size:200% 200%, 200% 200%, 100% 100%;
  animation: afBgShift 9s ease-in-out infinite;
}
#af-splash .af-stage { position:relative; display:grid; place-items:center;
                       width:230px; height:230px; }
#af-splash .af-stage > * { grid-area:1 / 1; }
#af-splash .af-ring {
  width:210px; height:210px; border-radius:50%;
  background:conic-gradient(from 0deg, transparent 0 58%, rgba(0,245,160,.85) 72%,
            rgba(11,224,255,.95) 82%, transparent 94%);
  -webkit-mask:radial-gradient(farthest-side, transparent 69%, #000 71%);
          mask:radial-gradient(farthest-side, transparent 69%, #000 71%);
  animation: afSpin 3.4s linear infinite; opacity:.9;
}
#af-splash .af-ring.r2 {
  width:170px; height:170px;
  background:conic-gradient(from 180deg, transparent 0 66%, rgba(165,94,253,.8) 82%, transparent 96%);
  -webkit-mask:radial-gradient(farthest-side, transparent 66%, #000 68%);
          mask:radial-gradient(farthest-side, transparent 66%, #000 68%);
  animation: afSpinRev 4.6s linear infinite; opacity:.75;
}
#af-splash .af-pulse {
  width:150px; height:150px; border-radius:50%;
  border:2px solid rgba(11,224,255,.55); animation: afPulse 2.6s ease-out infinite;
}
#af-splash .af-pulse.d2 { animation-delay:.9s; border-color:rgba(0,245,160,.5); }
#af-splash .af-pulse.d3 { animation-delay:1.8s; border-color:rgba(165,94,253,.5); }
#af-splash .af-emblem { animation: afPop .85s cubic-bezier(.2,.9,.3,1.35) both,
                                   afGlow 1.8s ease-in-out .7s infinite; }
#af-splash .af-stroke { stroke-dasharray:340; animation: afDraw 1.15s ease-out .15s both; }
#af-splash .af-spark  { animation: afSpark 1.2s ease-in-out .6s infinite; }
#af-splash .af-word {
  position:relative; font-family:'Inter','Segoe UI',sans-serif; font-weight:800;
  font-size:3rem; letter-spacing:-1px; line-height:1;
  background:linear-gradient(90deg,#00f5a0,#0be0ff,#a55efd,#0be0ff,#00f5a0);
  background-size:220% auto; -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent;
  animation: afRise .7s ease .5s both, afFlow 3.5s linear .5s infinite;
}
#af-splash .af-tag {
  font-family:'JetBrains Mono','Consolas',monospace; font-size:.78rem;
  letter-spacing:2px; color:#8aa6c8; text-transform:uppercase;
  animation: afRise .7s ease .95s both;
}
#af-splash .af-bar {
  position:relative; width:230px; height:3px; border-radius:99px;
  background:rgba(255,255,255,.07); overflow:hidden;
  animation: afRise .6s ease .8s both;
}
#af-splash .af-bar > span {
  position:absolute; inset:0; width:0; border-radius:99px;
  background:linear-gradient(90deg,#00f5a0,#0be0ff,#a55efd);
  box-shadow:0 0 12px rgba(11,224,255,.7); animation: afBar 3.4s ease-out .4s forwards;
}
#af-splash .af-particles span {
  position:absolute; bottom:32%; width:6px; height:6px; border-radius:50%;
  background:#0be0ff; opacity:0; animation: afFloat 3s ease-in infinite;
}
#af-splash .af-particles span:nth-child(1){ left:38%; animation-delay:.2s; background:#00f5a0; }
#af-splash .af-particles span:nth-child(2){ left:46%; animation-delay:.9s; }
#af-splash .af-particles span:nth-child(3){ left:54%; animation-delay:.5s; background:#a55efd; }
#af-splash .af-particles span:nth-child(4){ left:60%; animation-delay:1.3s; }
#af-splash .af-particles span:nth-child(5){ left:34%; animation-delay:1.6s; background:#a55efd; }
#af-splash .af-particles span:nth-child(6){ left:64%; animation-delay:.7s; background:#00f5a0; }
"""

_SPLASH_BODY = """
  <div class="af-bg"></div>
  <div class="af-particles"><span></span><span></span><span></span><span></span><span></span><span></span></div>
  <div class="af-stage">
    <div class="af-ring"></div>
    <div class="af-ring r2"></div>
    <div class="af-pulse"></div>
    <div class="af-pulse d2"></div>
    <div class="af-pulse d3"></div>
    <svg class="af-emblem" width="128" height="128" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="afSplashGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00f5a0"/>
          <stop offset="55%" stop-color="#0be0ff"/>
          <stop offset="100%" stop-color="#a55efd"/>
        </linearGradient>
      </defs>
      <polygon class="af-stroke" points="32,3 55,16.5 55,43.5 32,57 9,43.5 9,16.5"
               fill="rgba(11,224,255,0.05)" stroke="url(#afSplashGrad)" stroke-width="2.4"
               stroke-linejoin="round"/>
      <path class="af-stroke" d="M18 46 L32 18 L46 46" fill="none" stroke="url(#afSplashGrad)"
            stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
      <line class="af-stroke" x1="24" y1="37" x2="40" y2="37" stroke="url(#afSplashGrad)"
            stroke-width="4.4" stroke-linecap="round"/>
      <circle class="af-spark" cx="32" cy="12" r="3.2" fill="#0be0ff"/>
    </svg>
  </div>
  <div class="af-word">AlphaForge</div>
  <div class="af-tag">The platform that tells you the truth</div>
  <div class="af-bar"><span></span></div>
"""


def render_splash() -> None:
    """
    Play the AlphaForge brand splash once per browser tab.

    Call this only from the app's entry page. It is a no-op on repeat runs and
    leaves no styles behind, so it can never affect other pages or their charts.
    """
    try:
        import streamlit.components.v1 as components
    except Exception:
        return
    script = (
        "<script>(function(){try{"
        "var W=window.parent,D=W&&W.document;"
        "if(!D||!W.sessionStorage||W.sessionStorage.getItem('af_splash_done'))return;"
        "W.sessionStorage.setItem('af_splash_done','1');"
        "var s=D.createElement('style');s.id='af-splash-style';"
        "s.textContent=`" + _SPLASH_CSS + "`;D.head.appendChild(s);"
        "var o=D.createElement('div');o.id='af-splash';"
        "o.innerHTML=`" + _SPLASH_BODY + "`;D.body.appendChild(o);"
        "setTimeout(function(){"
        "if(o&&o.parentNode)o.parentNode.removeChild(o);"
        "if(s&&s.parentNode)s.parentNode.removeChild(s);"
        "}," + str(_SPLASH_MS + 200) + ");"
        "}catch(e){}})();</script>"
    )
    components.html(script, height=0)


def apply_quantedge_theme() -> None:
    """Inject the full AlphaForge cognitive UI theme into the current page."""
    try:
        st.logo("utils/logo.svg")
    except AttributeError:
        pass
    st.markdown(_CSS, unsafe_allow_html=True)
    st.markdown(_JS,  unsafe_allow_html=True)


def qe_metric_cards(metrics: dict, cols: int = 4) -> None:
    """Render a row of neuroscience-styled metric cards."""
    positive_keywords = ["cagr", "sharpe", "sortino", "return", "win", "ic"]
    negative_keywords = ["drawdown", "var", "cvar", "loss", "vol"]

    cards_html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:16px 0;">'
    for label, value in metrics.items():
        lk = label.lower()
        css_class = ""
        if any(k in lk for k in positive_keywords):
            css_class = "positive"
        elif any(k in lk for k in negative_keywords):
            css_class = "negative"
        cards_html += f"""
        <div class="qe-metric-card">
          <div class="qe-metric-label">{label}</div>
          <div class="qe-metric-value {css_class}">{value}</div>
        </div>"""
    cards_html += "</div>"
    st.markdown(cards_html, unsafe_allow_html=True)


def qe_section_header(title: str, subtitle: str = "") -> None:
    """Render a styled section header with optional subtitle."""
    sub_html = (
        f'<div style="color:var(--text-dim);font-size:0.85rem;margin-top:6px;'
        f'font-family:var(--font-mono);">{subtitle}</div>'
        if subtitle else ""
    )
    st.markdown(f'''
    <div class="qe-page-header">
      <div style="color:var(--text-dim);font-family:var(--font-mono);
                  font-size:0.72rem;text-transform:uppercase;letter-spacing:2px;
                  margin-bottom:6px;">AlphaForge · Research Terminal</div>
      <div style="font-size:1.7rem;font-weight:700;
                  background:linear-gradient(135deg,#e8f4fd 0%,#0be0ff 60%,#a55efd 100%);
                  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                  background-clip:text;letter-spacing:-0.5px;">{title}</div>
      {sub_html}
    </div>''', unsafe_allow_html=True)


def qe_neon_divider() -> None:
    """Render an animated neon gradient divider between page sections."""
    st.markdown(
        """
        <div style="
            height: 2px;
            width: 100%;
            margin: 14px 0 18px 0;
            border-radius: 999px;
            background: linear-gradient(90deg,
                rgba(0,245,160,0.0)  0%,
                rgba(0,245,160,0.95) 18%,
                rgba(11,224,255,0.95) 50%,
                rgba(165,94,253,0.95) 82%,
                rgba(165,94,253,0.0) 100%);
            box-shadow:
                0 0 10px rgba(11,224,255,0.55),
                0 0 24px rgba(165,94,253,0.25);
        "></div>
        """,
        unsafe_allow_html=True,
    )


def qe_faq_section(title: str, faqs: list[tuple[str, str]]) -> None:
    """Render a neon divider followed by a styled FAQ accordion."""
    qe_neon_divider()
    st.markdown(f"### {title}")
    for question, answer in faqs:
        st.markdown(
            f"""
            <div style="
                background: rgba(14,22,42,0.82);
                border: 1px solid rgba(11,224,255,0.18);
                border-radius: 12px;
                padding: 14px 16px;
                margin: 10px 0;
                box-shadow: 0 0 18px rgba(11,224,255,0.08);
            ">
              <div style="font-weight:700;color:#e8f4fd;margin-bottom:6px;">Q. {question}</div>
              <div style="color:var(--text-dim);line-height:1.55;">A. {answer}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def qe_regime_box(regime: str, recommendation: str = "") -> None:
    """Render a pulsing regime environment indicator box."""
    regime_lower = regime.lower()
    if "bull" in regime_lower:
        css, icon, color = "qe-regime-bull",     "📈", "var(--accent-buy)"
    elif "bear" in regime_lower:
        css, icon, color = "qe-regime-bear",     "📉", "var(--accent-sell)"
    else:
        css, icon, color = "qe-regime-sideways", "↔",  "var(--accent-gold)"

    rec_html = (
        f'<div style="margin-top:10px;font-size:0.84rem;color:var(--text-dim);'
        f'font-family:var(--font-mono);">{recommendation}</div>'
        if recommendation else ""
    )
    st.markdown(f'''
    <div class="{css}" style="margin:12px 0;">
      <div style="font-size:0.72rem;font-family:var(--font-mono);text-transform:uppercase;
                  letter-spacing:1.5px;color:var(--text-dim);margin-bottom:8px;">
        Current Market Regime
      </div>
      <div style="font-size:1.3rem;font-weight:700;color:{color};">{icon} {regime}</div>
      {rec_html}
    </div>''', unsafe_allow_html=True)


def apply_plotly_theme(fig, title: str = "", height: int = 500):
    """Apply the AlphaForge dark Plotly theme to any figure."""
    fig.update_layout(
        **PLOTLY_LAYOUT,
        height=height,
        title=dict(text=title, font=dict(size=15, color="#e8f4fd"), x=0.01),
    )
    return fig