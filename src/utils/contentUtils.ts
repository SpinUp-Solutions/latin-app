export const stripAdminAnnotations = (htmlContent: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  const annotationSelectors = [
    '[data-verb-circle="true"]',
    '[data-infinitive-double-circle="true"]',
    '[data-participle-box="true"]',
    '[data-nominative-underline="true"]',
    '[data-accusative-double-underline="true"]',
    '[data-predicate-nominative-squiggle="true"]',
    '[data-predicate-accusative-double-squiggle="true"]',
    '[data-genitive-bold="true"]',
    '[data-shared-italic="true"]',
    '[data-vocative-v="true"]',
    '[data-passive="true"]',
    '[data-compound="true"]',
    '[data-prepositional-parentheses="true"]',
    '[data-subordinate-brackets="true"]',
  ];

  annotationSelectors.forEach(selector => {
    const elements = tempDiv.querySelectorAll(selector);
    elements.forEach(element => {
      const annotationClasses = element.className.split(' ').filter(cls => !cls.startsWith('diagram-'));

      const tooltipId = element.getAttribute('data-tooltip-id');
      const isTooltip = element.getAttribute('data-tooltip');

      Array.from(element.attributes).forEach(attr => {
        element.removeAttribute(attr.name);
      });

      if (isTooltip) {
        element.setAttribute('data-tooltip', 'true');
        if (tooltipId) element.setAttribute('data-tooltip-id', tooltipId);
        element.className =
          'tooltip-text cursor-help underline decoration-dotted decoration-blue-500/60 hover:decoration-blue-500 transition-colors';
      } else {
        element.className = annotationClasses.join(' ');
      }

      element.removeAttribute('style');
    });
  });

  return tempDiv.innerHTML;
};
