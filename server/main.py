from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi_jwt_auth.exceptions import AuthJWTException
from .api import router as api_router
from fastapi.security import OAuth2PasswordBearer
from .config import get_settings
from .auth_config import router as auth_router
from fastapi.middleware.cors import CORSMiddleware


settings = get_settings()
app = FastAPI(title=settings.PROJECT_NAME)

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(AuthJWTException)
def authjwt_exception_handler(request: Request, exc: AuthJWTException):
    # see https://github.com/IndominusByte/fastapi-jwt-auth/issues/97
    return JSONResponse(
        status_code=exc.status_code, # type: ignore
        content={"detail": exc.message} # type: ignore
    )



# Include routers
app.include_router(api_router , prefix="/apiv1")
app.include_router(auth_router, prefix="/auth")

# Additional configurations like middleware can be added here

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
