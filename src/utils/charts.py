import streamlit as st


def get_chart_colors():
    is_dark = st.session_state.theme == 'dark'
    return {
        'bg': '#1e293b' if is_dark else '#ffffff',
        'ax_bg': '#0f172a' if is_dark else '#f8fafc',
        'text': '#f1f5f9' if is_dark else '#1e293b',
        'grid': '#334155' if is_dark else '#cbd5e1'
    }