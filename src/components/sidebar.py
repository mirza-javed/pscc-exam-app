import streamlit as st

def render_sidebar(user_info, db):
    user_info = user_info or {}
    user_name = user_info.get('Full_Name') or user_info.get('Name') or 'Staff Member'
    user_role = user_info.get('Role') or user_info.get('Responsibility') or 'Teacher'
    class_incharge = user_info.get('Class_Incharge_Of', 'None')

    st.sidebar.markdown(f"## 👤 {user_name}")
    st.sidebar.markdown(f"**Role:** `{user_role}`")
    if class_incharge and class_incharge.lower() != 'none':
        st.sidebar.markdown(f"**Class Incharge:** `{class_incharge}`")

    col_logout, col_refresh = st.sidebar.columns(2)
    with col_logout:
        if st.button("🚪 Logout", use_container_width=True):
            st.session_state.logged_in = False
            st.session_state.user_info = None
            st.rerun()
    with col_refresh:
        if st.button("🔄 Refresh", use_container_width=True):
            st.cache_data.clear()
            st.rerun()

    st.sidebar.divider()

    st.sidebar.markdown("### 🎨 Theme Settings")
    col_light, col_dark = st.sidebar.columns(2)
    with col_light:
        if st.button("☀️ Light", use_container_width=True,
                     type="primary" if st.session_state.theme == 'light' else "secondary",
                     key="theme_light_btn"):
            st.session_state.theme = 'light'
            st.rerun()
    with col_dark:
        if st.button("🌙 Dark", use_container_width=True,
                     type="primary" if st.session_state.theme == 'dark' else "secondary",
                     key="theme_dark_btn"):
            st.session_state.theme = 'dark'
            st.rerun()

    st.sidebar.divider()