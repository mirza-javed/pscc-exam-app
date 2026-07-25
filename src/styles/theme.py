import streamlit as st


def inject_theme_css():
    current_theme = st.session_state.get('theme', 'light')
    is_dark = current_theme == 'dark'

    if is_dark:
        bg_primary = "#0f172a"
        bg_secondary = "#1e293b"
        bg_tertiary = "#334155"
        card_bg = "#1e293b"
        card_border = "#334155"
        text_primary = "#f1f5f9"
        text_secondary = "#cbd5e1"
        text_muted = "#94a3b8"
        accent_blue = "#60a5fa"
        gradient_hero = "linear-gradient(135deg, #1e293b 0%, #334155 40%, #475569 100%)"
        shadow_sm = "0 4px 12px rgba(0, 0, 0, 0.5)"
        shadow_md = "0 8px 20px rgba(0, 0, 0, 0.6)"
        shadow_lg = "0 10px 25px -5px rgba(0, 0, 0, 0.7)"
        tab_bg = "#334155"
        tab_selected_bg = "#475569"
        tab_text = "#cbd5e1"
        tab_selected_text = "#f1f5f9"
    else:
        bg_primary = "#f8fafc"
        bg_secondary = "#ffffff"
        bg_tertiary = "#f1f5f9"
        card_bg = "#ffffff"
        card_border = "#e2e8f0"
        text_primary = "#0f172a"
        text_secondary = "#475569"
        text_muted = "#64748b"
        accent_blue = "#2563eb"
        gradient_hero = "linear-gradient(135deg, #0f172a 0%, #1e3a8a 40%, #2563eb 100%)"
        shadow_sm = "0 4px 12px rgba(0, 0, 0, 0.03)"
        shadow_md = "0 8px 20px rgba(37, 99, 235, 0.12)"
        shadow_lg = "0 10px 25px -5px rgba(37, 99, 235, 0.25)"
        tab_bg = "#f1f5f9"
        tab_selected_bg = "#ffffff"
        tab_text = "#475569"
        tab_selected_text = "#1e3a8a"

    st.markdown(f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700&display=swap');

    :root {{
        --bg-primary: {bg_primary};
        --bg-secondary: {bg_secondary};
        --bg-tertiary: {bg_tertiary};
        --card-bg: {card_bg};
        --card-border: {card_border};
        --text-primary: {text_primary};
        --text-secondary: {text_secondary};
        --text-muted: {text_muted};
        --accent-blue: {accent_blue};
        --gradient-hero: {gradient_hero};
        --shadow-sm: {shadow_sm};
        --shadow-md: {shadow_md};
        --shadow-lg: {shadow_lg};
        --tab-bg: {tab_bg};
        --tab-selected-bg: {tab_selected_bg};
        --tab-text: {tab_text};
        --tab-selected-text: {tab_selected_text};
    }}

    html, body, .stApp, [data-testid="stAppViewContainer"], [data-testid="stHeader"], [data-testid="stToolbar"] {{
        background-color: {bg_primary} !important;
    }}

    section[data-testid="stSidebar"], [data-testid="stSidebar"] {{
        background-color: {bg_secondary} !important;
    }}
    section[data-testid="stSidebar"] *, [data-testid="stSidebar"] * {{
        color: {text_primary} !important;
    }}

    [data-testid="stMain"], [data-testid="stMainBlockContainer"] {{
        background-color: {bg_primary} !important;
    }}

    .stApp, .stApp *, .stApp * *, .stApp * * * {{
        color: {text_primary} !important;
    }}

    .stApp button, .stApp [data-testid="baseButton-primary"], .stApp [data-testid="baseButton-secondary"] {{
        color: white !important;
    }}
    .stApp [data-testid="baseButton-secondary"] {{
        background-color: {bg_tertiary} !important;
        color: {text_primary} !important;
        border-color: {card_border} !important;
    }}

    p, span, div, label, li, a, strong, em, small, td, th, caption {{
        color: {text_primary} !important;
    }}

    h1, h2, h3, h4, h5, h6 {{
        color: {text_primary} !important;
    }}

    [data-testid="stMetricValue"] {{
        color: {text_primary} !important;
    }}
    [data-testid="stMetricLabel"] {{
        color: {text_secondary} !important;
    }}
    [data-testid="stMetricDelta"] {{
        color: {text_secondary} !important;
    }}
    [data-testid="stMetricDeltaUp"], [data-testid="stMetricDeltaDown"] {{
        color: {text_secondary} !important;
    }}

    .stExpander, div[data-testid="stExpander"] {{
        background-color: {card_bg} !important;
        border-color: {card_border} !important;
    }}
    .stExpander * {{
        color: {text_primary} !important;
    }}
    .stAlert {{
        background-color: {bg_tertiary} !important;
    }}
    .stAlert * {{
        color: {text_primary} !important;
    }}
    .stForm {{
        background-color: {bg_secondary} !important;
    }}
    .stForm * {{
        color: {text_primary} !important;
    }}

    .eczjsme11, .st-bb, .st-bc {{
        background-color: {bg_secondary} !important;
        color: {text_primary} !important;
    }}

    .stSelectbox label, .stTextInput label, .stNumberInput label {{
        color: {text_secondary} !important;
    }}
    .stSelectbox *, .stTextInput *, .stNumberInput * {{
        color: {text_primary} !important;
    }}

    .stDataFrame, [data-testid="stDataFrame"], [data-testid="stDataFrameResizable"] {{
        color: {text_primary} !important;
    }}
    .stDataFrame *, [data-testid="stDataFrame"] * {{
        color: {text_primary} !important;
    }}

    .stCodeBlock, pre, code {{
        background-color: {bg_tertiary} !important;
        color: {text_primary} !important;
    }}

    .stFileUploader {{
        color: {text_primary} !important;
    }}
    .stFileUploader * {{
        color: {text_primary} !important;
    }}

    .stDownloadButton > button {{
        color: white !important;
    }}

    [data-testid="stMarkdownContainer"] {{
        color: {text_primary} !important;
    }}

    [data-testid="stVerticalBlockBorderBox"] {{
        background-color: {bg_secondary} !important;
    }}
    [data-testid="stVerticalBlockBorderBox"] * {{
        color: {text_primary} !important;
    }}

    .stTabs [data-testid="stVerticalBlock"] {{
        color: {text_primary} !important;
    }}

    [data-testid="stNotification"] {{
        color: {text_primary} !important;
    }}
    [data-testid="stNotification"] * {{
        color: {text_primary} !important;
    }}

    .stCheckbox label, .stRadio label {{
        color: {text_primary} !important;
    }}

    [data-testid="column"] * {{
        color: {text_primary} !important;
    }}

    .empty-state {{
        text-align: center;
        padding: 3rem 2rem;
        background-color: {bg_tertiary};
        border-radius: 12px;
        border: 2px dashed {card_border};
        margin: 1rem 0;
    }}
    .empty-state-icon {{
        font-size: 3rem;
        margin-bottom: 1rem;
    }}
    .empty-state-title {{
        font-size: 1.25rem;
        font-weight: 700;
        color: {text_primary};
        margin-bottom: 0.5rem;
    }}
    .empty-state-description {{
        font-size: 0.95rem;
        color: {text_secondary};
        margin-bottom: 1rem;
    }}
    .empty-state-action {{
        margin-top: 1rem;
    }}

    .loading-container {{
        text-align: center;
        padding: 2rem;
    }}
    .loading-text {{
        font-size: 1rem;
        color: {text_secondary};
        margin-top: 0.5rem;
    }}

    .stApp {{
        font-family: 'Inter', sans-serif;
        background-color: var(--bg-primary);
        color: var(--text-primary);
    }}

    h1, h2, h3, h4, h5 {{
        font-family: 'Outfit', 'Inter', sans-serif;
        color: var(--text-primary);
    }}

    .hero-header {{
        background: var(--gradient-hero);
        color: var(--text-primary);
        padding: 2rem 2.5rem;
        border-radius: 16px;
        margin-bottom: 2rem;
        box-shadow: var(--shadow-lg);
        position: relative;
        overflow: hidden;
    }}
    .hero-header::after {{
        content: '';
        position: absolute;
        top: -50%;
        right: -10%;
        width: 300px;
        height: 300px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 50%;
        pointer-events: none;
    }}
    .hero-header h1 {{
        margin: 0;
        font-size: 2.2rem;
        font-weight: 800;
        color: #ffffff !important;
        letter-spacing: -0.02em;
    }}
    .hero-header p {{
        margin: 0.5rem 0 0 0;
        opacity: 0.95;
        font-size: 1.05rem;
        font-weight: 400;
        color: #ffffff !important;
    }}

    .stat-card {{
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 14px;
        padding: 1.25rem 1.5rem;
        box-shadow: var(--shadow-sm);
        transition: all 0.25s ease-in-out;
        border-top: 4px solid var(--accent-blue);
    }}
    .stat-card:hover {{
        transform: translateY(-3px);
        box-shadow: var(--shadow-md);
    }}
    .stat-label {{
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.3rem;
    }}
    .stat-value {{
        font-size: 1.8rem;
        font-weight: 800;
        color: var(--text-primary);
        font-family: 'Outfit', sans-serif;
    }}
    .stat-badge {{
        display: inline-block;
        margin-top: 0.4rem;
        padding: 0.2rem 0.6rem;
        border-radius: 20px;
        font-size: 0.78rem;
        font-weight: 700;
    }}

    .badge-aplus {{ background-color: {"#166534" if is_dark else "#dcfce7"}; color: {"#dcfce7" if is_dark else "#15803d"}; border: 1px solid {"#15803d" if is_dark else "#bbf7d0"}; }}
    .badge-a     {{ background-color: {"#075985" if is_dark else "#e0f2fe"}; color: {"#e0f2fe" if is_dark else "#0369a1"}; border: 1px solid {"#0369a1" if is_dark else "#bae6fd"}; }}
    .badge-b     {{ background-color: {"#854d0e" if is_dark else "#fef9c3"}; color: {"#fef9c3" if is_dark else "#a16207"}; border: 1px solid {"#a16207" if is_dark else "#fef08a"}; }}
    .badge-c     {{ background-color: {"#9a3412" if is_dark else "#ffedd5"}; color: {"#ffedd5" if is_dark else "#c2410c"}; border: 1px solid {"#c2410c" if is_dark else "#fed7aa"}; }}
    .badge-d     {{ background-color: {"#6b21a8" if is_dark else "#f3e8ff"}; color: {"#f3e8ff" if is_dark else "#7e22ce"}; border: 1px solid {"#7e22ce" if is_dark else "#e9d5ff"}; }}
    .badge-f     {{ background-color: {"#991b1b" if is_dark else "#fee2e2"}; color: {"#fee2e2" if is_dark else "#b91c1c"}; border: 1px solid {"#b91c1c" if is_dark else "#fecaca"}; }}

    .stSelectbox div[data-baseweb="select"] > div {{
        border-radius: 10px !important;
        min-height: 48px !important;
        border-color: var(--card-border) !important;
        background-color: var(--card-bg) !important;
        color: var(--text-primary) !important;
    }}
    .stTextInput input {{
        min-height: 48px !important;
        border-radius: 10px !important;
        background-color: var(--card-bg) !important;
        color: var(--text-primary) !important;
        border-color: var(--card-border) !important;
    }}
    .stButton > button {{
        border-radius: 10px !important;
        min-height: 48px !important;
        font-weight: 600 !important;
        font-size: 0.95rem !important;
        transition: all 0.2s ease-in-out !important;
    }}
    .stButton > button:hover {{
        transform: translateY(-1px) !important;
        box-shadow: var(--shadow-md) !important;
    }}

    .stTabs [data-baseweb="tab-list"] {{
        gap: 8px;
        background-color: var(--tab-bg);
        padding: 6px;
        border-radius: 12px;
    }}
    .stTabs [data-baseweb="tab"] {{
        min-height: 48px;
        white-space: pre;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.92rem;
        color: var(--tab-text);
        transition: all 0.2s ease;
    }}
    .stTabs [aria-selected="true"] {{
        background-color: var(--tab-selected-bg) !important;
        color: var(--tab-selected-text) !important;
        box-shadow: var(--shadow-sm) !important;
    }}

    .stContainer, [data-testid="stVerticalBlock"] {{
        background-color: var(--bg-secondary);
    }}

    @media (max-width: 480px) {{
        .hero-header {{
            padding: 1.25rem 1rem;
            border-radius: 12px;
        }}
        .hero-header h1 {{
            font-size: 1.25rem !important;
        }}
        .hero-header p {{
            font-size: 0.8rem !important;
        }}
        .stat-card {{
            padding: 1rem 1.25rem;
        }}
        .stat-value {{
            font-size: 1.2rem !important;
        }}
        .stat-label {{
            font-size: 0.75rem !important;
        }}
        .stButton > button {{
            width: 100% !important;
            min-height: 48px !important;
        }}
        .stTabs [data-baseweb="tab"] {{
            font-size: 0.8rem !important;
            padding: 0.5rem 0.75rem !important;
        }}
    }}

    @media (min-width: 481px) and (max-width: 768px) {{
        .hero-header {{
            padding: 1.5rem 1.25rem;
            border-radius: 12px;
        }}
        .hero-header h1 {{
            font-size: 1.6rem !important;
        }}
        .hero-header p {{
            font-size: 0.9rem !important;
        }}
        .stat-value {{
            font-size: 1.5rem !important;
        }}
        .stButton > button {{
            min-height: 48px !important;
        }}
    }}

    @media (min-width: 769px) and (max-width: 1024px) {{
        .hero-header {{
            padding: 1.75rem 2rem;
        }}
        .hero-header h1 {{
            font-size: 1.9rem !important;
        }}
    }}

    @media (max-width: 768px) {{
        .stDataFrame, .stDataEditor {{
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
        }}
    }}

    /* Keyboard Navigation & Focus Indicators */
    .stButton > button:focus-visible,
    .stSelectbox:focus-within,
    .stTextInput input:focus-visible,
    .stNumberInput input:focus-visible,
    a:focus-visible {{
        outline: 3px solid {accent_blue} !important;
        outline-offset: 2px !important;
    }}

    .skip-to-main {{
        position: absolute;
        top: -40px;
        left: 0;
        background: {accent_blue};
        color: white;
        padding: 8px;
        text-decoration: none;
        z-index: 9999;
    }}

    .skip-to-main:focus {{
        top: 0;
    }}
    /* Screen Reader only utility */
    .sr-only {{
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }}

    /* Smooth theme transition */
    html {{
        transition: background-color 0.3s ease, color 0.3s ease;
    }}
    .stApp {{
        transition: background-color 0.3s ease, color 0.3s ease;
    }}
</style>
""", unsafe_allow_html=True)