const pass = document.querySelector("password").textContent;

const pass2 = document.querySelector("confirm-password").textContent;

if(pass === pass2) {
    return;
} else {
    document.querySelector("confirm-password-error").classList.remove("hidden");
}
