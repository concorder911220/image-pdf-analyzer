import express from "express";
import { config } from "dotenv";
import { OpenAI } from "openai";
import { promises as _fs } from "node:fs";
import fs from "fs";
import multer from "multer";
import path from "path";
import { pdf } from "pdf-to-img";
import { fileURLToPath } from "url";
import { dirname } from "path";
config();

const app = express();
const port = process.env.PORT || 3034;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const upload = multer({ dest: "uploads/" });

const openAi = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

async function processPdf(filePath) {
  console.log("pdf to image calling", filePath);
  let counter = 1;
  const document = await pdf(filePath, { scale: 3 });
  let extractedText = "";

  for await (const image of document) {
    const imagePath = `./uploads/page${counter}.png`;
    console.log("image is ", image.length);

    await _fs.writeFile(imagePath, image);
    return imagePath;
  }
}

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    let filePath = req.file.path;
    if (req.file.mimetype === "application/pdf") {
      // Process PDF file
      filePath = await processPdf(filePath);
    }
    const imageBase64 = fs.readFileSync(filePath, { encoding: "base64" });
    const fileType = req.body.fileType;

    let prompt;

    switch (fileType) {
      case "trip-description":
        prompt = `In this file, it describes about trip description - a flyer with a basic information about the trip. 
                It has title, description, start and end date, itinearay. Order should be title, description, start date, end date, itinearay and should be structured into paragraphs.

                This is sample response: Title: ...

                Description: ...

                Start Date: ...

                End Date: ...

                Itinerary:

                - ...

                - ...

                ....

                Price details:

                - ...

                - ...
                ....
                Please extract those information correctly as originally from this image.`;
        break;
      case "envelope":
        prompt = `In this file, it describes about address. Extract the address information (street, city, postal code) from the following text and order should be street, city, postal code correctly.`;
        break;
      case "vendor-offer":
        prompt = `In this file, it describes vendor offer which includes price, conditions, item name, delivery date. 
                Order should be item name, price, conditions and delivery date be structured into paragraphs.
                Extract correctly the vendor offer details including item name, price, conditions and delivery date from the following image.`;
        break;
      default:
        prompt = `Extract information from the following image.`;
        break;
    }

    const completion = await openAi.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    });

    res.send({ message: completion.choices[0].message.content });
  } catch (error) {
    console.log(error);
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
