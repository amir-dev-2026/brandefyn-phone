# Brandefyn Phone

Browser phone used inside GoHighLevel (left menu → **Phone**). Calls run on Brandefyn's Twilio number; the backend is n8n.
No secrets live in this repo: the page key is only in the GHL custom page URL, and the user is identified by GHL's signed user context.

## extension/
Chrome extension that adds a **📞 Call** button on GHL contact pages. Install: download `extension/`, open `chrome://extensions`,
turn on **Developer mode**, click **Load unpacked**, pick the folder.
