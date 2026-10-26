const IMC = (() => {

  const redondear2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

  function calcular(pesoKg, tallaM) {
    const tallaCuadrada = tallaM * tallaM;
    if (tallaCuadrada <= 0) return null;
    const imc = redondear2(pesoKg / tallaCuadrada);
    return { peso: pesoKg, talla: tallaM, tallaCuadrada, imc, ...clasificar(imc) };
  }

  function clasificar(imc) {
    if (imc < 18.5) return { categoria: 'Bajo peso', clase: 'bajo' };
    if (imc < 25)   return { categoria: 'Peso normal', clase: 'normal' };
    if (imc < 30)   return { categoria: 'Sobrepeso', clase: 'sobre' };
    if (imc < 35)   return { categoria: 'Obesidad grado I', clase: 'obes' };
    if (imc < 40)   return { categoria: 'Obesidad grado II', clase: 'obes' };
    return { categoria: 'Obesidad grado III', clase: 'obes' };
  }

  function posicionEscala(imc) {
    return Math.max(0, Math.min(100, ((imc - 15) / (40 - 15)) * 100));
  }

  return { calcular, clasificar, redondear2, posicionEscala };
})();
