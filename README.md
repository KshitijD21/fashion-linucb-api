# Fashion LinUCB API 👗🤖

A sophisticated **Fashion Recommendation System** API powered by the **LinUCB (Linear Upper Confidence Bound)** contextual bandit algorithm. Built for hackathons and rapid prototyping with real-time learning capabilities.

## 🚀 Features

- **LinUCB Contextual Bandit Algorithm** - Smart exploration vs exploitation for fashion recommendations
- **Real-time Learning** - Adapts to user feedback (like/dislike/skip) instantly
- **Anonymous User Sessions** - No login required, session-based recommendations
- **MongoDB Atlas Integration** - Scalable cloud database storage
- **Express.js REST API** - Fast, lightweight, and well-documented endpoints
- **PNPM Package Management** - Faster, more efficient dependency management
- **ES6 Modules** - Modern JavaScript with import/export syntax
- **Comprehensive Testing** - Vitest testing framework with coverage reports
- **Production Ready** - Security headers, rate limiting, compression, and monitoring

## 🧠 LinUCB Algorithm Explained

The **LinUCB (Linear Upper Confidence Bound)** algorithm is a contextual bandit approach that:

1. **Learns User Preferences**: Uses user context (demographics, session data) and item features (color, style, brand)
2. **Balances Exploration vs Exploitation**: The `alpha` parameter controls how much to explore new items vs recommend proven favorites
3. **Real-time Updates**: Updates recommendation model with every user interaction
4. **Personalized Recommendations**: Provides increasingly accurate suggestions as it learns

### How It Works:
```
For each user request:
1. Extract user context features (age, gender, season, etc.)
2. Calculate confidence bounds for each fashion item
3. Select items with highest upper confidence bounds
4. Learn from user feedback (like/dislike/skip)
5. Update model parameters for better future recommendations
```

## 📁 Project Structure

```
fashion-linucb-api/
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── .gitignore               # Git ignore patterns
├── server.js                # Main application entry point
├── README.md                # This file
├── routes/                  # API endpoint definitions
│   ├── recommendations.js   # Recommendation endpoints
│   ├── feedback.js          # User feedback endpoints
│   ├── items.js            # Fashion items management
│   └── sessions.js         # Session management
├── models/                  # Data models and LinUCB algorithm
│   ├── LinUCB.js           # LinUCB algorithm implementation
│   ├── User.js             # User model
│   ├── FashionItem.js      # Fashion item model
│   └── Interaction.js      # User interaction tracking
├── utils/                   # Utility functions
│   ├── database.js         # MongoDB connection
│   ├── featureExtraction.js # Feature engineering
│   ├── validation.js       # Input validation
│   └── seedDatabase.js     # Database seeding
├── data/                    # Dataset storage
│   └── PREMIUM_FASHION_DATASET.csv
└── tests/                   # Test files
    ├── api.test.js         # API endpoint tests
    ├── linucb.test.js      # Algorithm tests
    └── utils.test.js       # Utility function tests
```

## 🛠 Installation & Setup

### Prerequisites
- **Node.js** >= 18.0.0
- **PNPM** >= 8.0.0
- **MongoDB Atlas** account and cluster

### 1. Clone & Install
```bash
# Clone the repository
git clone https://github.com/yourusername/fashion-linucb-api.git
cd fashion-linucb-api

# Install dependencies with PNPM
pnpm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env  # or use your preferred editor
```

**Required Environment Variables:**
- `MONGODB_URI` - Your MongoDB Atlas connection string
- `SESSION_SECRET` - Random string for session encryption
- `DATASET_PATH` - Path to your fashion dataset CSV

### 3. Database Setup
1. Create a **MongoDB Atlas** cluster
2. Create a database user with read/write permissions
3. Whitelist your IP address
4. Copy the connection string to `MONGODB_URI` in `.env`

### 4. Dataset Preparation
Place your fashion dataset CSV file in the `data/` directory as `PREMIUM_FASHION_DATASET.csv`

**Expected CSV format:**
```csv
id,name,category,subcategory,brand,color,size,price,description,image_url,style,season,gender,material
1,Summer Dress,Clothing,Dresses,Brand A,Blue,M,79.99,Beautiful summer dress,https://...,Casual,Summer,Female,Cotton
```

### 5. Start Development Server
```bash
# Start with auto-reload
pnpm dev

# Or start production mode
pnpm start
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
- **No authentication required** - Uses anonymous sessions
- Session ID automatically generated and managed via cookies

### Core Endpoints

#### 🎯 Get Recommendations
```http
GET /api/v1/recommendations
```

**Query Parameters:**
- `count` (optional): Number of recommendations (default: 10, max: 50)
- `category` (optional): Filter by category
- `gender` (optional): Filter by gender
- `budget_min` (optional): Minimum price
- `budget_max` (optional): Maximum price

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "id": "item_123",
        "name": "Summer Dress",
        "category": "Clothing",
        "brand": "Brand A",
        "price": 79.99,
        "confidence": 0.85,
        "image_url": "https://...",
        "features": {...}
      }
    ],
    "session_id": "sess_456",
    "algorithm_info": {
      "exploration_rate": 0.5,
      "total_interactions": 15
    }
  }
}
```

#### 👍 Submit Feedback
```http
POST /api/v1/feedback
```

**Request Body:**
```json
{
  "item_id": "item_123",
  "feedback": "like",  // "like", "dislike", "skip"
  "context": {
    "time_spent": 5000,  // milliseconds
    "position": 1        // position in recommendation list
  }
}
```

#### 👤 Get Session Info
```http
GET /api/v1/sessions/current
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "sess_456",
    "interactions_count": 15,
    "preferences": {
      "favorite_categories": ["Dresses", "Tops"],
      "preferred_brands": ["Brand A", "Brand B"],
      "price_range": [20, 100]
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### 📊 Get Algorithm Status
```http
GET /api/v1/algorithm/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_arms": 1000,
    "total_interactions": 1500,
    "exploration_rate": 0.5,
    "confidence_threshold": 0.1,
    "last_updated": "2024-01-15T10:30:00Z"
  }
}
```

### Error Responses
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid item_id provided",
    "details": {...}
  }
}
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage

# Run specific test file
pnpm test tests/api.test.js
```

## 🚀 Development Workflow

### Quick Start for Hackathons
1. **Setup**: Follow installation steps above
2. **Dataset**: Place your CSV in `data/PREMIUM_FASHION_DATASET.csv`
3. **Environment**: Set `AUTO_LOAD_DATASET=true` in `.env`
4. **Start**: Run `pnpm dev`
5. **Test**: Visit `http://localhost:3000/api/v1/recommendations`

### Development Scripts
```bash
# Start development server with auto-reload
pnpm dev

# Format code
pnpm format

# Lint code
pnpm lint

# Clean dependencies and build artifacts
pnpm clean

# Seed database with sample data
pnpm seed
```

### Code Quality
- **ESLint** for code linting
- **Prettier** for code formatting
- **Husky** for pre-commit hooks
- **Lint-staged** for staged file linting

## 🔧 Configuration

### LinUCB Parameters
Tune these in `.env` for better recommendations:

- **`LINUCB_ALPHA`** (0.1-2.0): Higher = more exploration, Lower = more exploitation
- **`FEATURE_DIMENSIONS`** (20-50): Number of item features to consider
- **`CONTEXT_DIMENSIONS`** (5-15): Number of user context features
- **`MIN_CONFIDENCE_THRESHOLD`** (0.05-0.2): Minimum confidence for recommendations

### Performance Tuning
- **`MAX_ARMS`**: Maximum items to keep in memory (affects memory usage)
- **`BATCH_SIZE`**: Dataset processing batch size
- **`RATE_LIMIT_REQUESTS`**: API rate limiting

## 🏗 Architecture

### LinUCB Algorithm Flow
```
User Request → Extract Context → Calculate Confidence Bounds →
Select Items → Return Recommendations → Collect Feedback →
Update Model → Repeat
```

### Technology Stack
- **Backend**: Node.js + Express.js
- **Database**: MongoDB Atlas
- **Algorithm**: LinUCB with ml-matrix for linear algebra
- **Session Management**: Express-session + connect-mongo
- **Testing**: Vitest + Supertest
- **Code Quality**: ESLint + Prettier

## 📈 Monitoring & Analytics

### Built-in Metrics
- **Recommendation CTR** (Click-through rate)
- **User Engagement** (likes/dislikes ratio)
- **Algorithm Performance** (exploration vs exploitation balance)
- **Session Analytics** (user behavior patterns)

### Performance Monitoring
- **Request latency** tracking
- **Database query** optimization
- **Memory usage** monitoring
- **Error rate** tracking

## 🚨 Troubleshooting

### Common Issues

**1. MongoDB Connection Failed**
```bash
# Check your connection string in .env
# Ensure IP is whitelisted in MongoDB Atlas
# Verify database user permissions
```

**2. Dataset Loading Issues**
```bash
# Verify CSV file exists at DATASET_PATH
# Check CSV format matches expected schema
# Ensure sufficient memory for large datasets
```

**3. Poor Recommendations**
```bash
# Increase LINUCB_ALPHA for more exploration
# Check feature extraction is working correctly
# Ensure sufficient user interactions for learning
```

**4. Performance Issues**
```bash
# Reduce MAX_ARMS if memory usage is high
# Optimize database queries
# Enable compression and caching
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines
- Follow existing code style (ESLint + Prettier)
- Write tests for new features
- Update documentation for API changes
- Use meaningful commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Hackathon Tips

### Quick Demo Setup
1. Use sample data from `utils/seedDatabase.js`
2. Enable debug routes for testing
3. Use Postman collection for API testing
4. Monitor logs for algorithm behavior

### Scaling for Production
1. Implement Redis for session storage
2. Add database indexing for performance
3. Enable clustering for multiple CPU cores
4. Add comprehensive logging and monitoring

### Algorithm Tuning
- Start with `LINUCB_ALPHA=0.5`
- Increase for new datasets (more exploration)
- Decrease after sufficient training data
- Monitor confidence scores and adjust accordingly

---

**Happy Hacking! 🚀** Built with ❤️ for fashion and machine learning enthusiasts.
