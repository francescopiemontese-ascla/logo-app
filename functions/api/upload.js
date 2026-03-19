// POST /api/upload — Upload a file to R2
// Body: multipart/form-data with field "file"
// Returns: { key, url, size, type }

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Generate unique key: timestamp + random + original extension
    const ext = file.name.split('.').pop() || 'bin';
    const key = `logos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();

    await env.R2.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
      },
      customMetadata: {
        originalName: file.name,
      },
    });

    return Response.json({
      key,
      url: `/api/file/${key}`,
      size: file.size,
      type: file.type,
      name: file.name,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
