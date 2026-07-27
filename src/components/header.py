import streamlit as st
import textwrap


def render_hero_header(user_name, user_role):
    st.markdown(textwrap.dedent(f"""
    <div class="hero-header" role="banner" aria-label="Dashboard header">
        <div class="hero-inner">
            <div class="crest" aria-hidden="true">PSCC</div>
            <div class="hero-text">
                <div class="hero-eyebrow">Pakistan Steel Cadet College &middot; Karachi</div>
                <h1>Examination Portal</h1>
                <div class="hero-meta">
                    <span class="dot"></span>
                    Signed in as&nbsp;<strong>{user_name}</strong>&nbsp;&middot;&nbsp;{user_role}
                </div>
            </div>
        </div>
    </div>
    """), unsafe_allow_html=True)
