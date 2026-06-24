export const exportToPDF = async (element: HTMLElement, filename: string) => {
  const html2pdf = (await import('html2pdf.js')).default;

  const opt = {
    margin: 20,
    filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: true,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 1100
    },
    jsPDF: {
      unit: 'mm' as const,
      format: 'a4' as const,
      orientation: 'landscape' as const
    },
    pagebreak: {
      mode: ['css', 'legacy'],
      before: '.page-break'
    }
  };

  try {
    await html2pdf().set(opt).from(element).save();
  } catch (error) {
    console.error('PDF Export failed:', error);
    throw error;
  }
};
