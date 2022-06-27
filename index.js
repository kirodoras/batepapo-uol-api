import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';

const port = 5000;
const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);

let db;
mongoClient.connect().then(() => {
	db = mongoClient.db("bate_papo_uol");
});

const nameSchema = joi.object({
	name: joi.string().required()
});

const fromSchema = joi.string().required();

const messageShema = joi.object({
	to: joi.string().required(),
	text: joi.string().required(),
	type: joi.string().valid('message', 'private_message').required()
});

app.post("/participants", async (req, res) => {
	const validation = nameSchema.validate(req.body, { abortEarly: true });

	if (validation.error) {
		res.sendStatus(422);
		return;
	}

	const { name } = req.body;

	const user = await db.collection("participants").findOne({ name: name });

	if (user) {
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

app.get("/participants", async (req, res) => {
	try {
		const participants = await db.collection("participants").find().toArray();
		res.status(200).send(participants);
	} catch {
		res.sendStatus(500);
	}
});

app.post("/messages", async (req, res) => {
	const validationFrom = fromSchema.validate(req.headers.user, { abortEarly: true });
	const validationMessage = messageShema.validate(req.body, { abortEarly: true });

	if (validationFrom.error || validationMessage.error) {
		res.sendStatus(422);
		return;
	}

	const from = req.headers.user;
	const { to, text, type } = req.body;

	const user = await db.collection("participants").findOne({ name: to });

	if (!user && to !== 'Todos') {
		res.sendStatus(406);
		return;
	}

	try {
		await SendMessage(from, to, text, type);
		res.sendStatus(201);
	} catch {
		res.sendStatus(500);
	}
});

app.get("/messages", async (req, res) => {
	const validationUser = fromSchema.validate(req.headers.user, { abortEarly: true });

	if (validationUser.error) {
		res.sendStatus(422);
		return;
	}

	const user = req.headers.user;
	const limit = parseInt(req.query.limit);

	try {
		const messages = await db.collection("messages").find().toArray();
		const filterMessages = messages.filter((value) => {
			if (value.type === 'private_message' && value.from !== user && value.to !== user) {
				return false;
			}
			return true;
		});

		if (!isNaN(limit)) {
			const resizeMessages = await resizeArr(limit, filterMessages);
			res.status(200).send(resizeMessages);
		} else {
			res.status(200).send(filterMessages);
		}
	} catch {
		res.sendStatus(500);
	}
});

app.post("/status", async (req, res) => {
	const validationUser = fromSchema.validate(req.headers.user, { abortEarly: true });

	if (validationUser.error) {
		res.sendStatus(422);
		return;
	}

	const user = req.headers.user;

	const userFound = await db.collection("participants").findOne({ name: user });

	if (!userFound) {
		res.sendStatus(404);
		return;
	}

	try {
		const currentStatus = Date.now();
		await db.collection("participants")
			.updateOne({
				name: userFound.name
			}, {
				$set: {
					lastStatus: currentStatus
				}
			});
		res.sendStatus(200);
	} catch {
		res.sendStatus(500);
	}
});

app.delete("/messages/:id", async (req, res) => {
	const validationUser = fromSchema.validate(req.headers.user, { abortEarly: true });

	if (validationUser.error) {
		res.sendStatus(422);
		return;
	}

	const user = req.headers.user;
	const id = req.params.id;

	try {
		const message = await db.collection("messages").findOne({ _id: ObjectId(id) });

		if (message.from !== user) {
			res.sendStatus(401);
			return;
		}

		await db.collection("messages").deleteOne({ _id: message._id });
		res.sendStatus(200);
	} catch {
		res.sendStatus(404);
	}
});

app.put("/messages/:id", async (req, res) => {
	const validationFrom = fromSchema.validate(req.headers.user, { abortEarly: true });
	const validationMessage = messageShema.validate(req.body, { abortEarly: true });

	if (validationFrom.error || validationMessage.error) {
		res.sendStatus(422);
		return;
	}

	const from = req.headers.user;
	const { text } = req.body;
	const id = req.params.id;

	try {
		const message = await db.collection("messages").findOne({ _id: ObjectId(id) });
		console.log(message._id)
		if (!message) {
			res.sendStatus(404);
			return;
		}
		if (message.from !== from) {
			res.sendStatus(401);
			return;
		}

		await db.collection("messages")
			.updateOne({
				_id: message._id
			}, {
				$set: {
					text: text
				}
			});
		res.sendStatus(200);
	} catch (error) {
		res.sendStatus(500);
	}
});

setInterval(async () => {
	try {
		const participants = await db.collection("participants").find().toArray();

		for (let participant of participants) {
			const currentStatus = Date.now();
			if (participant.lastStatus < currentStatus - 10000) {
				await db.collection("participants").deleteOne({ _id: participant._id });
				await SendMessage(participant.name, 'Todos', 'sai da sala...', 'status');
			}
		}
	} catch (error) {
		console.log(error);
	}
}, 15000);

async function resizeArr(num, arr) {
	const length = arr.length;
	if (num >= length) return arr;
	const result = arr.slice(length - num, length);
	return result;
}

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