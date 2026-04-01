const express = require("express");
const router = express.Router();
const multer = require("multer");
const mongoose = require("mongoose");
const messageModel = require("../schemas/messages");
const { CheckLogin } = require("../utils/authHandler");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// GET / - lấy message cuối cùng của mỗi cuộc hội thoại
router.get("/", CheckLogin, async function (req, res) {
  try {
    const currentUserId = new mongoose.Types.ObjectId(req.user._id);

    const messages = await messageModel.aggregate([
      {
        $match: {
          $or: [{ from: currentUserId }, { to: currentUserId }]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          partner: {
            $cond: {
              if: { $eq: ["$from", currentUserId] },
              then: "$to",
              else: "$from"
            }
          }
        }
      },
      {
        $group: {
          _id: "$partner",
          lastMessage: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$lastMessage" } },
      {
        $lookup: {
          from: "users",
          localField: "from",
          foreignField: "_id",
          as: "from"
        }
      },
      { $unwind: "$from" },
      {
        $lookup: {
          from: "users",
          localField: "to",
          foreignField: "_id",
          as: "to"
        }
      },
      { $unwind: "$to" }
    ]);

    res.send(messages);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

// GET /:userID - lấy toàn bộ tin nhắn giữa user hiện tại và userID
router.get("/:userID", CheckLogin, async function (req, res) {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userID;

    const messages = await messageModel
      .find({
        $or: [
          { from: currentUserId, to: otherUserId },
          { from: otherUserId, to: currentUserId }
        ]
      })
      .populate("from", "username fullName avatarUrl")
      .populate("to", "username fullName avatarUrl")
      .sort({ createdAt: 1 });

    res.send(messages);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

// POST / - gửi tin nhắn
router.post("/", CheckLogin, upload.single("file"), async function (req, res) {
  try {
    const { to, text } = req.body;

    if (!to) {
      return res.status(400).send({ message: "to (userID) la bat buoc" });
    }

    let messageContent;
    if (req.file) {
      messageContent = { type: "file", text: req.file.path };
    } else {
      if (!text) {
        return res.status(400).send({ message: "text la bat buoc khi khong co file" });
      }
      messageContent = { type: "text", text };
    }

    const newMessage = new messageModel({
      from: req.user._id,
      to,
      messageContent
    });

    await newMessage.save();
    res.send(newMessage);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;
