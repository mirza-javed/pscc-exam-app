import streamlit as st
import textwrap

from src.styles.logo import LOGO_DATA_URI


def render_hero_header(user_name, user_role):
    st.markdown(textwrap.dedent(f"""
    <div class="hero-header" role="banner" aria-label="Dashboard header">
        <div class="hero-inner">
            <div class="crest"><img src="{LOGO_DATA_URI}" alt="Pakistan Steel Cadet College crest"></div>
            <div class="hero-text">
                <div class="hero-eyebrow">Pakistan Steel Cadet College &middot; Karachi</div>
                <div class="hero-title" style="color:#ffffff !important;">Examination Portal</div>
                <div class="hero-meta">
                    <span class="dot"></span>
                    Signed in as&nbsp;<strong>{user_name}</strong>&nbsp;&middot;&nbsp;{user_role}
                </div>
            </div>
        </div>
    </div>
    """), unsafe_allow_html=True)
