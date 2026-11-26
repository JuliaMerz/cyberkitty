from fastapi import APIRouter
from .crud import router as crud_router
from .generator import router as generator_router

router = APIRouter()

router.include_router(crud_router, prefix='/data', tags=['data'])
router.include_router(
    generator_router, prefix='/generator', tags=['generator'])


