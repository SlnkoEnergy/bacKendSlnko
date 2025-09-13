// src/controllers/tasks.controllers.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const tasksController = require('../src/controllers/tasks.controllers');
const User = require('../src/models/user.model');
const TaskCounterSchema = require('../src/models/taskcounter.model');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { userId: '507f191e810c19729de860ea' };
  next();
});
app.post('/v1/tasks/task', tasksController.createTask);
jest.setTimeout(30000);

describe('createTask (integration)', () => {
  let user;

  beforeAll(async () => {
    // Create a user for testing
    user = await User.create({
    _id: new mongoose.Types.ObjectId('507f191e810c19729de860ea'),
    name: 'Test User',
    department: 'IT',
    role: 'employee',
    password: 'testpassword',
    email: 'testuser@example.com',
    emp_id: 'EMP001'
  });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('should create a task and return 201', async () => {
    // Optionally create a TaskCounterSchema document for the user
    await TaskCounterSchema.create({ createdBy: user._id, count: 0 });

    const res = await request(app)
      .post('/v1/tasks/task')
      .send({
        assigned_to: [user._id],
        title: 'Test Task',
        description: 'Test Description'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body).toHaveProperty('taskCode');
    expect(res.body.title).toBe('Test Task');
    expect(res.body.description).toBe('Test Description');
  });

  // Add more integration tests for other scenarios as needed
});