export const PROMOTED_CAROUSEL_FETCH_LIMIT = 60;

export function getPromotedProductsPerSlide(totalProducts) {
  const total = Math.max(0, Number(totalProducts) || 0);
  if (total >= 25) return 3;
  if (total >= 11) return 2;
  return 1;
}

export function groupPromotedProducts(products = []) {
  const safeProducts = Array.isArray(products) ? products : [];
  const perSlide = getPromotedProductsPerSlide(safeProducts.length);
  const slides = [];
  for (let index = 0; index < safeProducts.length; index += perSlide) {
    const slide = safeProducts.slice(index, index + perSlide);
    for (let fillIndex = 0; slide.length < perSlide; fillIndex += 1) {
      slide.push(safeProducts[fillIndex % safeProducts.length]);
    }
    slides.push(slide);
  }
  return { perSlide, slides };
}
