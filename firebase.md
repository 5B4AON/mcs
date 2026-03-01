# Deploy to Google Firebase

### Install node modules
```sh
npm install
```

### Login to firebase
```sh
firebase login
```

### Initialise hosting
To recreate `.firebaserc` and `firebase.json` if they do not exist.
```sh
firebase init hosting
```

### Build distribution
```sh
ng build --configuration=production
```

### Deploy
```sh
firebase deploy --only hosting
```
