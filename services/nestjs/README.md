```bash
npm i -g @nestjs/cli

nest new project-name --strict
```

https://docs.nestjs.com/recipes/crud-generator

https://docs.nestjs.com/recipes/passport

https://docs.nestjs.com/techniques/mongodb

https://docs.nestjs.com/openapi/introduction

https://docs.nestjs.com/security/authentication

https://docs.nestjs.com/security/encryption-and-hashing

https://docs.nestjs.com/security/helmet

https://docs.nestjs.com/security/cors

https://docs.nestjs.com/security/csrf

Prompt:
```
Implement a nest.js auth-service app that has the following features:

1. Database:
1.1..mongodb with this path: mongodb://localhost/kino-auth-prod
1.2. has users collection with the following fields:
1.2.1 username, type: String, required: true
1.2.2. password, type: String, required: true, minLength: 8, maxLength: 64, the password is hashed with 10 salt rounds.
1.2.3. email, type: String, unique in the collection, has a regex match validation for valid email
1. Endpoints:
1.1. /auth/api/v1/register
1.1.1. if password strength is less than score of 4, it returns: {
      message: 'Password is too weak',
      suggestions: passwordStrength.feedback.suggestions,
    }
1.1.2. save the user, and returns 201
1.2. /auth/api/v1/login
1.2.1. if password is invalid: returns 401
1.2.2. returns token signed with a secret key
1.3. /auth/api/v1/secured - secured endpoint that returns "You have accessed a secured route!" if the user provided a valid token, otherwise 401


Do it with nestjs best pratices, use as much nestjs features as possible, if it doesn't have a feature, try to use a 3rd party library and indicate you used it.
```
