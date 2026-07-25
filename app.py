import streamlit as st
from src.styles.theme import inject_theme_css
from src.database.connection import load_database
from src.auth.login import login_screen
from src.auth.permissions import get_staff_permissions
from src.components.sidebar import render_sidebar
from src.components.header import render_hero_header
from src.pages import analytics, data_entry, reports

st.set_page_config(
    page_title="PS Cadet College Karachi Exam Portal",
    page_icon="\U0001F393",
    layout="wide",
    initial_sidebar_state="expanded"
)

if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = None

if 'theme' not in st.session_state:
    st.session_state.theme = 'light'

st.markdown("""
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
""", unsafe_allow_html=True)

inject_theme_css()

try:
    with st.spinner("\U0001F504 Connecting to PSCC Master Database..."):
        app_db = load_database()

    if not st.session_state.logged_in:
        login_screen(app_db)
    else:
        user_info = st.session_state.user_info or {}
        perm = get_staff_permissions(user_info, app_db)

        render_sidebar(user_info, app_db)

        user_name = user_info.get('Full_Name') or user_info.get('Name') or 'Staff Member'
        user_role = user_info.get('Role') or user_info.get('Responsibility') or 'Teacher'
        render_hero_header(user_name, user_role)

        tab1, tab2, tab3 = st.tabs([
            "\U0001F4CA Examination Analytics",
            "\u270D Marks Data Entry",
            "\U0001F4CB Result Reports & Cadet Cards"
        ])

        with tab1:
            analytics.render(app_db, perm)
        with tab2:
            data_entry.render(app_db, perm)
        with tab3:
            reports.render(app_db, perm)

except Exception as e:
    st.error("\u26A0 **Application Error**")
    with st.expander("\U0001F50D Technical Details (for IT Support)"):
        st.code(str(e))
    st.info("\U0001F4A1 Try refreshing the page or contact your system administrator.")