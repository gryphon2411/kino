# Use the official Gradle image from the openjdk Docker Hub page
FROM gradle:7.4-jdk17 as builder

# Add Maintainer Info
LABEL maintainer="eido.askayo@gmail.com"

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Set the working directory
WORKDIR /home/gradle/project

# Copy the Gradle configuration files into the Docker image
COPY build.gradle settings.gradle ./

# Copy the source code into the Docker image
COPY src ./src

# Build the project inside the Docker container
RUN gradle build --no-daemon

# Use OpenJDK 17 for the runtime stage
FROM eclipse-temurin:17-jdk-alpine

# Install necessary packages
RUN apk --no-cache add libstdc++

# Set the working directory
WORKDIR /app

# Copy the jar file from the builder stage into this new stage
COPY --from=builder /home/gradle/project/build/libs/*.jar app.jar

# Set the startup command to execute the jar
CMD ["java", "-jar", "/app/app.jar"]
