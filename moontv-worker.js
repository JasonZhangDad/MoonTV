addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // 获取传递过来的目标地址
  let targetUrlStr = url.searchParams.get("url");
  if (!targetUrlStr) {
    return new Response("Missing url parameter", { status: 400 });
  }

  try {
    // 完美转发所有查询参数
    const targetUrlObj = new URL(targetUrlStr);
    url.searchParams.forEach((value, key) => {
      if (key !== "url") {
        targetUrlObj.searchParams.append(key, value);
      }
    });
    targetUrlStr = targetUrlObj.toString();

    // 构造新请求发给国内源站，伪装成浏览器
    const newRequest = new Request(targetUrlStr, {
      method: request.method,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
      },
      body: request.body
    });

    const response = await fetch(newRequest);
    
    // 允许跨域调用
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.delete("X-Frame-Options");
    
    return new Response(response.body, {
      status: response.status,
      headers: headers,
    });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}