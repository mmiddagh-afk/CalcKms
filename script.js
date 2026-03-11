const form = document.getElementById('converter');
const kmInput = document.getElementById('kmInput');
const resultValue = document.getElementById('resultValue');

const KM_TO_MI = 0.621371;

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const value = Number(kmInput.value);

  if (!Number.isFinite(value) || value < 0) {
    resultValue.textContent = 'Ingresa un valor válido';
    return;
  }

  const miles = value * KM_TO_MI;
  resultValue.textContent = `${miles.toFixed(2)} mi`;
});
