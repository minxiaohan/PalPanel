const $ = (selector) => document.querySelector(selector);

async function login() {
  $("#loginMessage").textContent = "正在登录...";
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: $("#username").value.trim(),
      password: $("#password").value
    })
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    $("#loginMessage").textContent = data.error || "登录失败。";
    return;
  }
  location.href = "/";
}

$("#loginBtn").addEventListener("click", () => login().catch((error) => {
  $("#loginMessage").textContent = error.message || String(error);
}));

$("#password").addEventListener("keydown", (event) => {
  if (event.key === "Enter") login().catch((error) => {
    $("#loginMessage").textContent = error.message || String(error);
  });
});
