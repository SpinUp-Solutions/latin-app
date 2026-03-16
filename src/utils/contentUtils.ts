import { DIAGRAM_MARK_DEFINITIONS } from './sentenceDiagramming';

export const stripAdminAnnotations = (htmlContent: string): string => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  const annotationSelectors = DIAGRAM_MARK_DEFINITIONS.map(definition => `[${definition.dataAttribute}="true"]`);

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
