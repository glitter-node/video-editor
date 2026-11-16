from fastapi import APIRouter

from app.api.merge_models import MergeRecipe
from app.api.merge_plan import MergePlan, build_merge_plan

router = APIRouter(prefix="/api/merge", tags=["merge"])


@router.post("/plan", response_model=MergePlan)
def merge_plan(recipe: MergeRecipe) -> MergePlan:
    return build_merge_plan(recipe)
