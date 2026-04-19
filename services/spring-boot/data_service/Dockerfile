# Use the official Gradle image from the openjdk Docker Hub page
FROM gradle:8.4-jdk17 as builder

# Add Maintainer Info
LABEL maintainer="eido.askayo@gmail.com"

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Set the working directory
WORKDIR /home/gradle/project

# Copy the commons library into the Docker image
COPY commons /home/gradle/commons

# Copy the Gradle configuration files into the Docker image
COPY data_service/build.gradle data_service/settings.gradle ./

# Copy the source code into the Docker image
COPY data_service/src ./src

# Build the project inside the Docker container
RUN gradle build --no-daemon

# Use OpenJDK 17 for the runtime stage
FROM eclipse-temurin:17-jdk-alpine

# Set the working directory
WORKDIR /app

# Copy the jar file from the builder stage into this new stage
COPY --from=builder /home/gradle/project/build/libs/*.jar app.jar

# Set the startup command to execute the jar
CMD ["java", "-jar", "/app/app.jar"]
