import os
import io
import streamlit as st
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload


SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file"
]

LOCAL_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "question_papers")


def get_drive_service():
    """Initializes Google Drive API v3 client using GCP Service Account from secrets."""
    if "gcp_service_account" not in st.secrets:
        return None
    try:
        creds_dict = dict(st.secrets["gcp_service_account"])
        creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
        service = build('drive', 'v3', credentials=creds)
        return service
    except Exception as e:
        return None


def get_target_folder_id(service, folder_name="PSCC_Question_Papers_2026"):
    """
    Retrieves explicitly configured folder_id from secrets, or finds an existing folder.
    Returns folder_id or None.
    """
    # 1. Check if folder_id is explicitly set in secrets
    if "google_drive" in st.secrets and "folder_id" in st.secrets["google_drive"]:
        return st.secrets["google_drive"]["folder_id"]
    if "drive_folder_id" in st.secrets:
        return st.secrets["drive_folder_id"]

    try:
        query = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        results = service.files().list(q=query, fields="files(id, name)").execute()
        files = results.get('files', [])
        if files:
            return files[0]['id']
    except Exception:
        pass
    return None


def upload_question_paper_file(file_name: str, file_bytes: bytes, mime_type: str = "application/pdf", folder_name: str = "PSCC_Question_Papers_2026") -> dict:
    """
    Saves file locally in static/question_papers/ AND attempts Google Drive upload if folder_id is shared.
    Returns dict: {"success": True, "url": view_link, "mode": storage_mode}.
    """
    # Always save copy locally first to ensure 100% reliability
    os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)
    local_filepath = os.path.join(LOCAL_STORAGE_DIR, file_name)
    try:
        with open(local_filepath, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        pass

    local_url = f"app/static/question_papers/{file_name}"
    
    # Attempt Drive Upload
    service = get_drive_service()
    if service:
        folder_id = get_target_folder_id(service, folder_name)
        if folder_id:
            try:
                file_metadata = {
                    'name': file_name,
                    'parents': [folder_id]
                }
                media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=True)
                file_obj = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id, webViewLink, webContentLink',
                    supportsAllDrives=True
                ).execute()

                file_id = file_obj.get('id')
                try:
                    service.permissions().create(
                        fileId=file_id,
                        body={'type': 'anyone', 'role': 'reader'}
                    ).execute()
                except Exception:
                    pass

                view_link = file_obj.get('webViewLink') or file_obj.get('webContentLink') or f"https://drive.google.com/file/d/{file_id}/view"
                return {
                    "success": True,
                    "url": view_link,
                    "mode": "Google Drive",
                    "file_id": file_id,
                    "local_path": local_filepath
                }
            except Exception as e:
                # Quota or permission error when uploading to Drive root/unshared folder
                pass

    # Clean local fallback response
    return {
        "success": True,
        "url": local_url,
        "mode": "Local App Storage",
        "local_path": local_filepath
    }


def resolve_local_file_path(file_path_or_url: str) -> str | None:
    """Resolves a file path or URL to an existing local file path on disk."""
    if not file_path_or_url:
        return None
    file_path_or_url = str(file_path_or_url).strip()
    if file_path_or_url.startswith(("http://", "https://")):
        return None

    # Strip leading 'app/' if present
    clean_path = file_path_or_url
    if clean_path.startswith("app/"):
        clean_path = clean_path[4:]
    elif clean_path.startswith("/app/"):
        clean_path = clean_path[5:]

    # 1. Absolute path check
    if os.path.isabs(file_path_or_url) and os.path.exists(file_path_or_url):
        return file_path_or_url

    # 2. Relative to project root
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    p1 = os.path.normpath(os.path.join(project_root, clean_path))
    if os.path.exists(p1) and os.path.isfile(p1):
        return p1

    # 3. Relative within static/question_papers/
    fname = os.path.basename(file_path_or_url)
    p2 = os.path.normpath(os.path.join(LOCAL_STORAGE_DIR, fname))
    if os.path.exists(p2) and os.path.isfile(p2):
        return p2

    return None


def get_file_mime_type(file_name: str) -> str:
    """Returns appropriate MIME type for the given file name."""
    ext = os.path.splitext(file_name)[1].lower()
    mimes = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
        ".txt": "text/plain",
    }
    return mimes.get(ext, "application/octet-stream")


def render_document_attachment(file_url: str, sub_id: str, key_prefix: str = "doc") -> None:
    """
    Renders document attachment actions (PDF download, Word .docx download, browser view, image preview).
    Prevents blank page navigation issues by offering both direct static URL (/app/static/...)
    and native Streamlit download buttons.
    """
    if not file_url or not str(file_url).strip():
        st.caption("ℹ️ No attached document for this submission.")
        return

    raw_url = str(file_url).strip()
    is_web_url = raw_url.startswith(("http://", "https://"))
    local_path = resolve_local_file_path(raw_url)

    # 1. If it's an external web URL (e.g. Google Drive)
    if is_web_url:
        st.markdown(
            f'<a href="{raw_url}" target="_blank" rel="noopener noreferrer" '
            f'style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; '
            f'background: #1D4ED8; color: white; border-radius: 6px; text-decoration: none; '
            f'font-size: 13px; font-weight: 500; margin-bottom: 8px;">'
            f'🌐 Open in Google Drive ↗</a>',
            unsafe_allow_html=True
        )

    # 2. If the local file is present on disk
    if local_path and os.path.exists(local_path):
        try:
            with open(local_path, "rb") as f:
                file_bytes = f.read()

            file_name = os.path.basename(local_path)
            mime_type = get_file_mime_type(file_name)
            file_size_kb = len(file_bytes) / 1024
            browser_static_url = f"app/static/question_papers/{file_name}"

            # Check if a sibling .docx exists for a .pdf, or vice versa
            base_no_ext, ext = os.path.splitext(local_path)
            docx_path = base_no_ext + ".docx"
            pdf_path = base_no_ext + ".pdf"

            has_docx = os.path.exists(docx_path) and docx_path != local_path
            has_pdf = os.path.exists(pdf_path) and pdf_path != local_path

            if has_docx or has_pdf:
                c1, c2, c3 = st.columns([1.2, 1.2, 1.2])
                # Primary file button
                with c1:
                    lbl = "📥 Download PDF" if ext.lower() == ".pdf" else f"📥 Download {ext.upper()[1:]}"
                    st.download_button(
                        label=lbl,
                        data=file_bytes,
                        file_name=file_name,
                        mime=mime_type,
                        key=f"{key_prefix}_main_{sub_id}",
                        use_container_width=True
                    )
                # Sibling file button (Word / PDF)
                with c2:
                    if has_docx:
                        with open(docx_path, "rb") as df:
                            docx_bytes = df.read()
                        docx_name = os.path.basename(docx_path)
                        st.download_button(
                            label="📝 Download Word (.docx)",
                            data=docx_bytes,
                            file_name=docx_name,
                            mime=get_file_mime_type(docx_name),
                            key=f"{key_prefix}_docx_{sub_id}",
                            use_container_width=True
                        )
                    elif has_pdf:
                        with open(pdf_path, "rb") as pf:
                            sibling_pdf_bytes = pf.read()
                        pdf_name = os.path.basename(pdf_path)
                        st.download_button(
                            label="📥 Download PDF",
                            data=sibling_pdf_bytes,
                            file_name=pdf_name,
                            mime="application/pdf",
                            key=f"{key_prefix}_sibling_pdf_{sub_id}",
                            use_container_width=True
                        )
                with c3:
                    st.markdown(
                        f'<a href="{browser_static_url}" target="_blank" rel="noopener noreferrer" '
                        f'style="display: flex; align-items: center; justify-content: center; height: 38px; '
                        f'background: #F1F5F9; color: #1E3A8A; border: 1px solid #CBD5E1; border-radius: 8px; '
                        f'text-decoration: none; font-size: 13px; font-weight: 600; padding: 0 10px;">'
                        f'👁️ Open in Tab ↗</a>',
                        unsafe_allow_html=True
                    )
            else:
                c1, c2 = st.columns([1.5, 1.2])
                with c1:
                    lbl = "📝 Download Word (.docx)" if ext.lower() in [".docx", ".doc"] else "📥 Download File"
                    st.download_button(
                        label=lbl,
                        data=file_bytes,
                        file_name=file_name,
                        mime=mime_type,
                        key=f"{key_prefix}_dl_{sub_id}",
                        use_container_width=True
                    )
                with c2:
                    st.markdown(
                        f'<a href="{browser_static_url}" target="_blank" rel="noopener noreferrer" '
                        f'style="display: flex; align-items: center; justify-content: center; height: 38px; '
                        f'background: #F1F5F9; color: #1E3A8A; border: 1px solid #CBD5E1; border-radius: 8px; '
                        f'text-decoration: none; font-size: 13px; font-weight: 600; padding: 0 10px;">'
                        f'👁️ Open in Tab ↗</a>',
                        unsafe_allow_html=True
                    )

            st.caption(f"📁 **File:** `{file_name}` ({file_size_kb:.1f} KB)")

            # Image inline preview
            if file_name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                with st.expander("🖼️ View Attached Image Preview", expanded=False):
                    st.image(file_bytes, caption=file_name, use_container_width=True)

        except Exception as e:
            st.error(f"⚠️ Error reading local file: {e}")

    elif not is_web_url:
        # File URL is recorded but not found locally on disk
        # Render static link with /app/static/ fallback
        fname = os.path.basename(raw_url)
        clean_static_url = f"app/static/question_papers/{fname}"
        st.markdown(
            f'📄 **File:** `{fname}` &nbsp;|&nbsp; '
            f'<a href="{clean_static_url}" target="_blank" rel="noopener noreferrer" '
            f'style="color: #1D4ED8; font-weight: 500;">👁️ Try Open in Browser</a>',
            unsafe_allow_html=True
        )



