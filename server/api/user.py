from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import cast, Annotated
from sqlmodel import Session, Field
from ..config import get_settings
from ..models import User, VerificationCode, VerificationCodeCreate
from ..database import get_db_session
from ..dependencies import GetDbObject
from ..auth_config import get_current_user, pwd_context
import sendgrid
from sendgrid.helpers.mail import Mail, To, Email, Content, TemplateId, Personalization


conf = get_settings()
sg = sendgrid.SendGridAPIClient(conf.SENDGRID_API_KEY)


router = APIRouter()

class UserCreate(BaseModel):
    email: str
    password: str

@router.post("/register")
async def register_user(user_data: UserCreate, db: Session = Depends(get_db_session)):
    # Check if user already exists
    db_user = db.query(User).filter(User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    new_user = User(**user_data.dict())
    new_user.hashed_password = pwd_context.hash(user_data.password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Generate verification code
    verification_code = VerificationCodeCreate(
        user_id=new_user.id,
        code="some_generated_code"  # You should generate a random and secure code here
    )
    new_verification_code = VerificationCode(**verification_code.dict())
    db.add(new_verification_code)
    db.commit()

    mail = Mail()

    mail.template_id = TemplateId(conf.VERIFICATION_EMAIL_TEMPLATE_ID)

    # Add personalizations (dynamic data)
    personalization = Personalization()
    personalization.add_to(To(email=new_user.email))
    personalization.add_from(Email(conf.EMAIL_FROM))
    personalization.add_dynamic_template_data("verification_link", f"{conf.DOMAIN_ROOT}/user/verify?code={new_verification_code.code}")
    personalization.add_dynamic_template_data("verification_code", new_user.name)
    # Add other dynamic data as needed
    mail.add_personalization(personalization)

    sg.send(mail)


    # Send email with verification link
    verification_link = f"https://yourdomain.com/verify?code={new_verification_code.code}"
    message = Mail(
        from_email='from_email@example.com',
        to_emails=new_user.email,
        subject='Verify your email',
        html_content=f"Please click on the link to verify your email: <a href='{verification_link}'>{verification_link}</a>"
    )
    sg.send(message)

    return {"message": "User registered successfully, please check your email to verify your account"}


@router.get("/verify")
async def verify_user(code: str, db: Session = Depends(get_db_session)):
    verification_code = db.query(VerificationCode).filter(VerificationCode.code == code).first()
    if not verification_code or verification_code.is_expired():
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    # Verify user
    user = db.query(User).filter(User.id == verification_code.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    user.verified = True
    db.commit()

    return {"message": "Email verified successfully, you may now login."}

