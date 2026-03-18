import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings


async def send_verification_email(to_email: str, code: str):
    if not settings.email_user or not settings.email_password:
        print(f"\n[DEV] Verification code for {to_email}: {code}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your verification code"
    msg["From"] = settings.email_user
    msg["To"] = to_email

    html = f"""
    <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
      <h2>Verify your email</h2>
      <p>Your verification code is:</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#dc2626;padding:16px 0">
        {code}
      </div>
      <p style="color:#6b7280;font-size:14px">This code expires in 15 minutes.</p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.email_host,
        port=settings.email_port,
        username=settings.email_user,
        password=settings.email_password,
        start_tls=True,
    )
