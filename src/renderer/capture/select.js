const selection = document.getElementById('selection');

let startX = 0;
let startY = 0;
let isDragging = false;

function updateSelection(currentX, currentY) {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  selection.style.display = 'block';
  selection.style.left = `${x}px`;
  selection.style.top = `${y}px`;
  selection.style.width = `${width}px`;
  selection.style.height = `${height}px`;
}

window.addEventListener('mousedown', (event) => {
  isDragging = true;
  startX = event.clientX;
  startY = event.clientY;
  updateSelection(startX, startY);
});

window.addEventListener('mousemove', (event) => {
  if (!isDragging) return;
  updateSelection(event.clientX, event.clientY);
});

window.addEventListener('mouseup', (event) => {
  if (!isDragging) return;
  isDragging = false;

  const x = Math.min(startX, event.clientX);
  const y = Math.min(startY, event.clientY);
  const width = Math.abs(event.clientX - startX);
  const height = Math.abs(event.clientY - startY);

  if (width < 20 || height < 20) {
    window.overlayApi.cancelOcrArea();
    return;
  }

  window.overlayApi.completeOcrArea({ x, y, width, height });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.overlayApi.cancelOcrArea();
});
