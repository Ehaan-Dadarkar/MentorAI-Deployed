const { PDFParse } = require("pdf-parse");

const extractTextFromPDF = async (buffer) => {
  const parser = new PDFParse({ data: buffer });

  try {
    const data = await parser.getText();

    return {
      text: data.text,
      numPages: data.total,
      info: {},
    };
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to extract text from PDF");
  } finally {
    await parser.destroy();
  }
};

module.exports = { extractTextFromPDF };
