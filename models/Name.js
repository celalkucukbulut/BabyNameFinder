const mongoose = require('mongoose');

const nameSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    gender: {
        type: String,
        required: true,
        enum: ['Kız', 'Erkek', 'Her ikisi']
    },
    origin: {
        type: String,
        required: true,
        trim: true
    },
    syllables: {
        type: Number,
        required: true,
        min: 1
    },
    length: {
        type: Number,
        required: true,
        min: 1
    },
    meaning: {
        type: String,
        required: true,
        trim: true
    },
    inQuran: {
        type: Boolean,
        required: true,
        default: false
    }
}, {
    timestamps: true // Automatically add createdAt and updatedAt fields
});

// Create index on name for faster searches
nameSchema.index({ name: 1 });

// Prevent OverwriteModelError in serverless environments
const Name = mongoose.models.Name || mongoose.model('Name', nameSchema);

module.exports = Name;
