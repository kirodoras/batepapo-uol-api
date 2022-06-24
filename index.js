import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';

const port = 5000;
const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URL);

let db;
mongoClient.connect().then(() => {
	db = mongoClient.db("bate_papo_uol");
});

const nameSchema = joi.object({
	name: joi.string().required()
});

app.post("/participants", async (req, res) => {
	const validation = nameSchema.validate(req.body, { abortEarly: true });

	if (validation.error) {
		res.sendStatus(422);
		return;
	}

	const { name } = req.body;

	const users = await db.collection("participants").findOne({ name: name });

	if (users) {
		res.sendStatus(409);
		return;
	}

	try {
		await db.collection("participants").insertOne({ name: name, lastStatus: Date.now() });
		await SendMessage(name, 'Todos', 'entra na sala...', 'status');
		res.sendStatus(201);
		return;
	} catch {
		res.sendStatus(500);
		return;
	}
});

app.get("/participants", async (req,res) => {
	try {
		const participants =  await db.collection("participants").find().toArray();
		res.status(200).send(participants);
	} catch {
		res.sendStatus(500);
	}
});

async function SendMessage(from, to, text, type) {
	const time = dayjs().format('HH:mm:ss');
	try {
		await db.collection("messages")
			.insertOne(
				{ 
					from, 
					to,
					text,
					type,
					time
				});
		return 1;
	} catch {
		return 0;
	}
}

app.listen(port, () => {
	console.log(`Running on ${port}`);
});