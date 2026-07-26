"""Secondary account controls kept out of the daily marks-entry flow."""

import streamlit as st


def render(user_info: dict) -> None:
    user_info = user_info or {}
    user_name = user_info.get("Full_Name") or user_info.get("Name") or "Staff member"
    user_role = user_info.get("Role") or user_info.get("Responsibility") or "Teacher"
    class_incharge = user_info.get("Class_Incharge_Of", "")

    st.title("More", anchor=False)
    with st.container(border=True):
        st.subheader(user_name)
        st.caption(user_role)
        if class_incharge and str(class_incharge).lower() != "none":
            st.write(f"Class in-charge: {class_incharge}")

    with st.container(border=True):
        st.subheader("Appearance")
        theme = st.segmented_control(
            "Theme",
            ["Light", "Dark"],
            default="Dark" if st.session_state.get("theme") == "dark" else "Light",
            width="stretch",
        )
        new_theme = "dark" if theme == "Dark" else "light"
        if new_theme != st.session_state.get("theme"):
            st.session_state.theme = new_theme
            st.rerun()

    with st.container(border=True):
        st.subheader("App controls")
        if st.button("Refresh data", icon=":material/refresh:", width="stretch"):
            st.cache_data.clear()
            st.toast("Data cache cleared. Reloading…", icon=":material/check_circle:")
            st.rerun()
        if st.button("Sign out", icon=":material/logout:", width="stretch"):
            st.session_state.logged_in = False
            st.session_state.user_info = None
            st.rerun()
