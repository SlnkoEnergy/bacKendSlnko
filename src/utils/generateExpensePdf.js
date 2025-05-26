const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
async function generateExpenseSheet(sheet, { department }) {
  // Calculate summary amounts by category
  const logoPath = path.resolve(__dirname, "../assets/1.png");
  const logoData = fs.readFileSync(logoPath).toString("base64");
  const logoSrc = `data:image/png;base64,${logoData}`;
  const summaryMap = {};
  let totalApproved = 0;
  let totalRequested = 0;

  (sheet.items || []).forEach((item) => {
    const category = item.category || "Others";
    const approved = Number(item.approved_amount) || 0;
    const requested = Number(item.invoice?.invoice_amount) || 0;

    if (!summaryMap[category]) {
      summaryMap[category] = { approved: 0, requested: 0 };
    }
    summaryMap[category].approved += approved;
    summaryMap[category].requested += requested;

    totalApproved += approved;
    totalRequested += requested;
  });

  // Create summary rows HTML
  const summaryRows = Object.entries(summaryMap)
    .map(([category, amounts]) => {
      return `
    <tr>
      <td style="border: 1px solid #000; padding: 6px; text-align: left;">${category}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(amounts.requested || 0).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(amounts.approved || 0).toFixed(2)}</td>
    </tr>
    `;
    })
    .join("");

  const summaryTotalRow = `
  <tr>
    <td style="border: 1px solid #000; padding: 6px; font-weight: bold; text-align: left;">Total</td>
    <td style="border: 1px solid #000; padding: 6px; font-weight: bold; text-align: right;">${Number(totalRequested || 0).toFixed(2)}</td>
    <td style="border: 1px solid #000; padding: 6px; font-weight: bold; text-align: right;">${Number(totalApproved || 0).toFixed(2)}</td>
  </tr>
`;

  const itemsHTML = (sheet.items || [])
    .map((item, i) => {
      const projectName = item.project_id?.name || "";
      const projectCode = item.project_id?.code || "";
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${projectCode}</td>
          <td>${projectName}</td>
          <td>${item.category}</td>
          <td class="left">${item.description || "-"}</td>
          <td>${item.expense_date ? new Date(item.expense_date).toLocaleDateString("en-IN") : "-"}</td>
          <td>${item.invoice?.invoice_amount || "-"}</td>
          <td>${item.approved_amount || "-"}</td>
        </tr>
      `;
    })
    .join("");

  const fromDate = new Date(sheet.expense_term.from).toLocaleDateString(
    "en-IN"
  );
  const toDate = new Date(sheet.expense_term.to).toLocaleDateString("en-IN");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          position: relative;
        }
        .watermark {
            position: fixed;
            top: 50%;
            left: 12%;
            transform: rotate(-45deg);
            font-size: 100px;
            color: rgba(0, 0, 0, 0.05);
            z-index: -1;
        }
       .header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.header img {
  max-height: 50px;
  max-width: 150px;
  object-fit: contain;
}

        h2.title {
          text-align: center;
          margin-bottom: 20px;
          font-size: 22px;
          text-transform: uppercase;
        }
        .info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .info div {
          width: 48%;
          font-size: 14px;
          line-height: 1.6;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        th, td {
          border: 1px solid #000;
          padding: 6px;
          text-align: center;
          vertical-align: top;
        }
        th {
          background-color: #f5f5f5;
        }
        td.left {
          text-align: left;
        }
        .summary-table {
          page-break-before: auto;
          page-break-inside: avoid;
          margin-top: 30px;
          width: 50%;
          font-size: 12px;
          margin-left: 354px;
        }
        .summary-table h3 {
          margin-bottom: 10px;
        }
        .summary-table table {
          border-collapse: collapse;
          width: 100%;
        }
      </style>
    </head>
    <body>
     <div class="watermark">Slnko Energy</div>
      <div class="header">
        <img style="width: 100px; height: 60px;" src="${logoSrc}" alt="Slnko Logo" />

      </div>

      <h2 class="title">Expense Sheet</h2>

      <div class="info">
        <div>
          <strong>Employee Name: </strong>${sheet.emp_name}<br>
          <strong>Employee Code: </strong>${sheet.emp_id}<br>
          <strong>Department: </strong>${department}
        </div>
        <div>
          <strong>Expense Period</strong><br>
          From: ${fromDate}<br>
          To: ${toDate}<br>
        </div>
        <div>
          <strong>Mobile Number: </strong>${sheet.user_id.phone}<br>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>S.No</th>
            <th>Project Code</th>
            <th>Site Name</th>
            <th>Category</th>
            <th>Description</th>
            <th>Date</th>
            <th>Requested Amount</th>
            <th>Approved Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="summary-table">
        <h3>Summary</h3>
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Category Type</th>
              <th>Requested Amount</th>
              <th>Approved Amount</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
            ${summaryTotalRow}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

  //   const rawPdf = await page.pdf({ format: "A4", printBackground: true });

  const rawPdf = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    margin: {
      top: "10px",
      bottom: "10px",
      left: "10px",
      right: "10px",
    },

    footerTemplate: `
  <div style="width: 100%; font-size: 12px; padding: 10px 10px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
    <div style="margin-bottom: 0px;">
      <span><strong>Note:</strong> Expense cannot be claimed beyond 45 days. Before submitting, make sure the difference is 0.</span>
    </div>
    <div">
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  </div>
`,
  });
  const pdfBuffer = Buffer.from(rawPdf);
  await browser.close();

  return pdfBuffer;
}

module.exports = generateExpenseSheet;
