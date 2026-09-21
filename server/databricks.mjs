let tokenCache = { token: "", expiresAt: 0 };

async function oauthToken(c) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "all-apis" });
  const basic = Buffer.from(`${process.env.DATABRICKS_CLIENT_ID}:${process.env.DATABRICKS_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${c.databricksHost}/oidc/v1/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body, signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Databricks OAuth failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

function rows(result) {
  const columns = result.manifest?.schema?.columns?.map(column => column.name) || [];
  return (result.result?.data_array || []).map(values => Object.fromEntries(columns.map((name, i) => [name, values[i]])));
}

async function call(c, path, init = {}) {
  const token = await oauthToken(c);
  const response = await fetch(`${c.databricksHost}${path}`, {
    ...init,
    signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `Databricks request failed: ${response.status}`);
  return body;
}

export async function execute(c, statement, parameters = []) {
  let result = await call(c, "/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({
      warehouse_id: c.warehouseId,
      statement,
      parameters,
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
      disposition: "INLINE",
      format: "JSON_ARRAY"
    })
  });
  const deadline = Date.now()+300000;
  while (["PENDING", "RUNNING"].includes(result.status?.state)) {
    if(Date.now()>deadline) {
      await call(c, `/api/2.0/sql/statements/${result.statement_id}/cancel`, {method:"POST"}).catch(()=>{});
      throw new Error("SQL execution timed out after five minutes");
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    result = await call(c, `/api/2.0/sql/statements/${result.statement_id}`);
  }
  if (result.status?.state !== "SUCCEEDED") {
    throw new Error(result.status?.error?.message || `SQL statement ended in ${result.status?.state}`);
  }
  if(result.manifest?.truncated) throw new Error("SQL result was truncated; narrow the query");
  const columns=result.manifest?.schema?.columns?.map(x=>x.name)||[];
  const output=rows(result);
  let next=result.result?.next_chunk_internal_link;
  while(next){
    if(!next.startsWith('/api/2.0/sql/statements/'))throw new Error('Invalid SQL result chunk URL');
    const chunk=await call(c,next);
    output.push(...(chunk.data_array||[]).map(v=>Object.fromEntries(columns.map((n,i)=>[n,v[i]]))));
    next=chunk.next_chunk_internal_link;
  }
  return output;
}

export const parameter = (name, value, type = "STRING") => ({ name, value: String(value), type });
