import streamlit as st
import textwrap
import pandas as pd


def login_screen(db):
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.markdown(textwrap.dedent("""
        <div class="login-brand">
            <div class="login-crest">PSCC</div>
            <div class="hero-eyebrow" style="letter-spacing:0.14em; color:var(--text-muted) !important;">
                Pakistan Steel Cadet College, Karachi
            </div>
            <h1 class="login-title">Examination Portal</h1>
            <p class="login-sub">Centralized marks management &amp; visual performance analytics</p>
            <div class="login-rule"></div>
        </div>
        """), unsafe_allow_html=True)

        with st.container(border=True):
            st.markdown("### \U0001F510 Staff Authentication")
            st.caption("Sign in with your registered college email address to access portal controls.")

            with st.form("login_form"):
                email_input = st.text_input("Registered Email Address", placeholder="e.g. teacher@pscc.edu.pk")
                submit_button = st.form_submit_button("Sign in to Portal", use_container_width=True, type="primary")

                if submit_button:
                    if email_input and email_input.strip():
                        staff_df = db["Staff_Directory"]
                        user_match = staff_df[staff_df['Email'].astype(str).str.strip().str.lower() == email_input.strip().lower()]

                        if not user_match.empty:
                            st.session_state.logged_in = True
                            st.session_state.user_info = user_match.iloc[0].to_dict()
                            st.success("Authentication successful! Loading dashboard...")
                            st.rerun()
                        else:
                            st.error("\u274C Email address not found in Staff Directory. Please contact the Administrator.")
                    else:
                        st.warning("\u26A0\uFE0F Please enter your registered email address.")

        st.markdown(textwrap.dedent("""
        <div class="portal-footer">
            \U0001F512 Access is restricted to registered staff of PS Cadet College Karachi.<br>
            Trouble signing in? Contact the Examination Office.<br>
            &copy; PS Cadet College Karachi &middot; Examination Portal
        </div>
        """), unsafe_allow_html=True)
