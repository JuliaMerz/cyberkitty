from fastapi import FastAPI
from server.api import router as api_router
from fastapi.security import OAuth2PasswordBearer
from server.config import get_settings
from server.auth_config import router as auth_router

settings = get_settings()
app = FastAPI(title=settings.PROJECT_NAME)


# Include routers
app.include_router(api_router , prefix="/apiv1")
app.include_router(auth_router, prefix="/auth")

# Additional configurations like middleware can be added here

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
