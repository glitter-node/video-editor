import { serializeRecipe } from "./recipe.js";

function serializeBody(body) {
  return { ...body, recipe: serializeRecipe(body.recipe) };
}

export async function presets() {
  const res = await fetch("/api/presets", { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }
  return await res.json();
}

export async function validateRecipe(body) {
  const res = await fetch("/api/recipe/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeBody(body)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }
  const response = await res.json();
  response.normalized = serializeRecipe(response.normalized);
  return response;
}

export async function plan(body) {
  let res;
  try {
    res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeBody(body)),
    });
  } catch (error) {
    error.stage = "API";
    error.message = `API: ${error.message}`;
    throw error;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = new Error(`API: ${res.status} ${res.statusText} ${text}`);
    error.stage = "API";
    throw error;
  }
  try {
    return await res.json();
  } catch (error) {
    error.stage = "API";
    error.message = `API: ${error.message}`;
    throw error;
  }
}
