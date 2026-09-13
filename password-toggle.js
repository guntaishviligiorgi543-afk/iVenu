(() => {
  const eyeIcon = `
    <svg class="password-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5c-5.2 0-9.4 3.1-11 7c1.6 3.9 5.8 7 11 7s9.4-3.1 11-7c-1.6-3.9-5.8-7-11-7zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5s5 2.2 5 5s-2.2 5-5 5zm0-8a3 3 0 1 0 0 6a3 3 0 0 0 0-6z" />
    </svg>`;
  const hiddenIcon = `
    <svg class="password-toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.3 2.3L2 3.6l3 3C3.2 7.8 1.8 9.7 1 12c1.6 3.9 5.8 7 11 7c1.4 0 2.7-.2 3.9-.7l3.5 3.4l1.3-1.3zM12 17c-3.7 0-6.9-2-8.8-5c.7-1.1 1.6-2 2.7-2.8l2 2A4 4 0 0 0 12 16c.8 0 1.6-.2 2.2-.7l1.5 1.5c-1.1.4-2.3.6-3.7.6zm-1.8-6.2l3 3A2.1 2.1 0 0 1 10.2 10.8zM12 7c3.7 0 6.9 2 8.8 5c-.6 1-1.5 2-2.5 2.7l1.5 1.5c1.6-1.2 2.8-2.7 3.2-4.2c-1.6-3.9-5.8-7-11-7c-1.2 0-2.4.2-3.5.5l1.6 1.6C10.8 7 11.4 7 12 7z" />
    </svg>`;

  function updateButton(button, visible) {
    button.innerHTML = visible ? hiddenIcon : eyeIcon;
    button.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password",
    );
    button.title = visible ? "Hide password" : "Show password";
  }

  function initializePasswordInput(input) {
    if (input.dataset.passwordToggleInitialized === "true") return;

    let wrapper = input.parentElement;
    if (!wrapper.classList.contains("password-input-wrapper")) {
      wrapper = document.createElement("span");
      wrapper.className = "password-input-wrapper";
      input.replaceWith(wrapper);
      wrapper.append(input);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-toggle";
    updateButton(button, false);
    button.addEventListener("click", () => {
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      updateButton(button, !visible);
    });
    wrapper.append(button);
    input.dataset.passwordToggleInitialized = "true";
  }

  function initializePasswordToggles() {
    document
      .querySelectorAll('input[type="password"]')
      .forEach(initializePasswordInput);
  }

  initializePasswordToggles();
  new MutationObserver(initializePasswordToggles).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
