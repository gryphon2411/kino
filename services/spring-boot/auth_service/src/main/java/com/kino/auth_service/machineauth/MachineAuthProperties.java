package com.kino.auth_service.machineauth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "kino.machine-auth")
public class MachineAuthProperties {
    private Duration tokenTtl = Duration.ofMinutes(5);
    private String issuer = "http://localhost:8081/api/v1/auth";
    private final SigningKeyProperties signingKey = new SigningKeyProperties();
    private final ClientProperties agent = new ClientProperties();
    private final WebBffProperties webBff = new WebBffProperties();

    public Duration getTokenTtl() {
        return this.tokenTtl;
    }

    public void setTokenTtl(Duration tokenTtl) {
        this.tokenTtl = tokenTtl;
    }

    public String getIssuer() {
        return this.issuer;
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    public SigningKeyProperties getSigningKey() {
        return this.signingKey;
    }

    public ClientProperties getAgent() {
        return this.agent;
    }

    public WebBffProperties getWebBff() {
        return this.webBff;
    }

    public static class SigningKeyProperties {
        private String privateKeyPath = "";
        private String publicKeyPath = "";

        public String getPrivateKeyPath() {
            return this.privateKeyPath;
        }

        public void setPrivateKeyPath(String privateKeyPath) {
            this.privateKeyPath = privateKeyPath;
        }

        public String getPublicKeyPath() {
            return this.publicKeyPath;
        }

        public void setPublicKeyPath(String publicKeyPath) {
            this.publicKeyPath = publicKeyPath;
        }
    }

    public static class ClientProperties {
        private String clientId = "";
        private String clientSecret = "";
        private List<String> scopes = new ArrayList<>();
        private String audience = "";

        public String getClientId() {
            return this.clientId;
        }

        public void setClientId(String clientId) {
            this.clientId = clientId;
        }

        public String getClientSecret() {
            return this.clientSecret;
        }

        public void setClientSecret(String clientSecret) {
            this.clientSecret = clientSecret;
        }

        public List<String> getScopes() {
            return this.scopes;
        }

        public void setScopes(List<String> scopes) {
            this.scopes = scopes;
        }

        public String getAudience() {
            return this.audience;
        }

        public void setAudience(String audience) {
            this.audience = audience;
        }
    }

    /**
     * Properties for the confidential Next.js BFF client. Browser code never
     * receives this client secret or the resulting OAuth tokens.
     */
    public static class WebBffProperties extends ClientProperties {
        private List<String> audiences = new ArrayList<>(List.of(
                "kino-data-api"
        ));
        private String redirectUri = "http://localhost:3000/api/auth/callback";
        private Duration accessTokenTtl = Duration.ofMinutes(5);
        private Duration refreshTokenTtl = Duration.ofHours(8);

        public String getRedirectUri() {
            return this.redirectUri;
        }

        public void setRedirectUri(String redirectUri) {
            this.redirectUri = redirectUri;
        }

        public List<String> getAudiences() {
            return this.audiences;
        }

        public void setAudiences(List<String> audiences) {
            this.audiences = audiences == null
                    ? new ArrayList<>()
                    : new ArrayList<>(audiences);
        }

        public Duration getAccessTokenTtl() {
            return this.accessTokenTtl;
        }

        public void setAccessTokenTtl(Duration accessTokenTtl) {
            this.accessTokenTtl = accessTokenTtl;
        }

        public Duration getRefreshTokenTtl() {
            return this.refreshTokenTtl;
        }

        public void setRefreshTokenTtl(Duration refreshTokenTtl) {
            this.refreshTokenTtl = refreshTokenTtl;
        }
    }
}
