import streamlit as st
import textwrap
import pandas as pd

def login_screen(db):
    st.markdown(textwrap.dedent("""
    <div class="hero-header">
        <h1>🎓 PS Cadet College Karachi Exam Portal</h1>
        <p>Pakistan Steel Cadet College Karachi — Centralized Marks Management & Visual Analytics</p>
    </div>
    """), unsafe_allow_html=True)

    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        with st.container(border=True):
            st.markdown("### 🔐 Staff Authentication")
            st.caption("Sign in with your registered college email address to access portal controls.")
            
            with st.form("login_form"):
                email_input = st.text_input("Registered Email Address", placeholder="e.g. teacher@pscc.edu.pk")
                submit_button = st.form_submit_button("🔑 Login to Portal", use_container_width=True, type="primary")

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
                            st.error("❌ Email address not found in Staff Directory. Please contact the Administrator.")
                    else:
                        st.warning("⚠️ Please enter your registered email address.")