export const stripAdminAnnotations = (htmlContent: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  const annotationSelectors = [
    '[data-preposition="true"]',
    '[data-subordination="true"]', 
    '[data-verb-circle="true"]',
    '[data-subject-underline="true"]',
    '[data-direct-object-underline="true"]',
    '[data-indirect-object-bracket="true"]',
    '[data-genitive-arrow="true"]',
    '[data-genitive-arrow-target="true"]',
    '[data-ablative-phrase="true"]'
  ];

  annotationSelectors.forEach(selector => {
    const elements = tempDiv.querySelectorAll(selector);
    elements.forEach(element => {
      const annotationClasses = element.className.split(' ').filter(cls => 
        !cls.includes('-annotation') && 
        !cls.includes('preposition') && 
        !cls.includes('subordination') &&
        !cls.includes('verb-circle') &&
        !cls.includes('subject-underline') &&
        !cls.includes('direct-object') &&
        !cls.includes('indirect-object') &&
        !cls.includes('genitive') &&
        !cls.includes('ablative')
      );
      
      const tooltipId = element.getAttribute('data-tooltip-id');
      const isTooltip = element.getAttribute('data-tooltip');
      
      Array.from(element.attributes).forEach(attr => {
        element.removeAttribute(attr.name);
      });
      
      if (isTooltip) {
        element.setAttribute('data-tooltip', 'true');
        if (tooltipId) element.setAttribute('data-tooltip-id', tooltipId);
        element.className = 'tooltip-text cursor-help underline decoration-dotted decoration-blue-500/60 hover:decoration-blue-500 transition-colors';
      } else {
        element.className = annotationClasses.join(' ');
      }
      
      element.removeAttribute('style');
    });
  });

  return tempDiv.innerHTML;
};