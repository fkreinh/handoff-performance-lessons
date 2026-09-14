(() => {
  const status = document.createElement('div');
  status.className = 'deep-dive-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  document.body.append(status);
  let statusTimer;
  const announce = (message) => {
    status.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; }, 2800);
  };
  document.querySelectorAll('.deep-copy').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.closest('figure').querySelector('code').textContent);
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = 'Copy'; }, 1800);
        announce('Code copied');
      } catch {
        announce('Select the code and copy it manually. Clipboard access is unavailable.');
      }
    });
  });
  const panels = [...document.querySelectorAll('.deep-dive')];
  const openLinkedPanel = () => {
    const panel = panels.find((item) => `#${item.id}` === location.hash);
    if (panel) panel.open = true;
  };
  addEventListener('hashchange', openLinkedPanel);
  openLinkedPanel();
  let printState;
  addEventListener('beforeprint', () => {
    if (printState) return;
    printState = panels.map((panel) => panel.open);
    panels.forEach((panel) => { panel.open = true; });
  });
  addEventListener('afterprint', () => {
    if (!printState) return;
    panels.forEach((panel, i) => { panel.open = printState[i]; });
    printState = undefined;
  });
})();
