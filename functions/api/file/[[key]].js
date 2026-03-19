// GET /api/file/logos/:key — Serve a file from R2
// DELETE /api/file/logos/:key — Delete a file from R2
// The [[key]] catches the full path after /api/file/

export async function onRequestGet(context) {
  const { env, params } = context;

  const key = params.key?.join('/');
  if (!key) {
    return Response.json({ error: 'No key' }, { status: 400 });
  }

  const object = await env.R2.get(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
}

export async function onRequestDelete(context) {
  const { env, params } = context;

  const key = params.key?.join('/');
  if (!key) {
    return Response.json({ error: 'No key' }, { status: 400 });
  }

  await env.R2.delete(key);
  return Response.json({ deleted: key });
}
