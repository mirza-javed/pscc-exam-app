import streamlit as st
import textwrap

def render_hero_header(user_name, user_role):
    st.markdown(textwrap.dedent(f"""
    <div class="hero-header" role="banner" aria-label="Dashboard header">
        <h1>📚 PS Cadet College Karachi Exam Portal</h1>
        <p>Welcome back, <strong>{user_name}</strong> | Role: {user_role}</p>
    </div>
    """), unsafe_allow_html=True)